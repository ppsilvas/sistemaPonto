import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface CreateUserPayload {
  nome?: unknown;
  email?: unknown;
  password?: unknown;
  perfil?: unknown;
  projetoIds?: unknown;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return jsonResponse(
      { error: 'Configuração de ambiente do servidor incompleta.' },
      500,
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Token de autenticação ausente.' }, 401);
  }

  const supabaseCaller = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const {
    data: { user: callerUser },
    error: callerAuthError,
  } = await supabaseCaller.auth.getUser();

  if (callerAuthError || !callerUser) {
    return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401);
  }

  const { data: callerRow, error: callerProfileError } = await supabaseAdmin
    .from('usuarios')
    .select('id, ativo, perfis(nome)')
    .eq('id', callerUser.id)
    .maybeSingle();

  const callerPerfis = callerRow?.perfis as
    | { nome: string }
    | Array<{ nome: string }>
    | null
    | undefined;
  const callerPerfilNome = Array.isArray(callerPerfis)
    ? callerPerfis[0]?.nome
    : callerPerfis?.nome;

  if (
    callerProfileError ||
    !callerRow ||
    !callerRow.ativo ||
    callerPerfilNome !== 'admin'
  ) {
    return jsonResponse(
      { error: 'Apenas administradores ativos podem cadastrar usuários.' },
      403,
    );
  }

  let body: CreateUserPayload;
  try {
    body = (await req.json()) as CreateUserPayload;
  } catch {
    return jsonResponse({ error: 'Corpo JSON inválido.' }, 400);
  }

  const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const perfil =
    body.perfil === 'admin' || body.perfil === 'worker' ? body.perfil : null;
  const projetoIds = Array.isArray(body.projetoIds)
    ? body.projetoIds.filter((id): id is string => typeof id === 'string')
    : [];

  if (!nome) {
    return jsonResponse({ error: 'O nome completo é obrigatório.' }, 400);
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return jsonResponse({ error: 'Informe um e-mail válido.' }, 400);
  }
  if (password.length < 8) {
    return jsonResponse(
      { error: 'A senha inicial deve ter pelo menos 8 caracteres.' },
      400,
    );
  }
  if (!perfil) {
    return jsonResponse({ error: 'Perfil inválido.' }, 400);
  }

  const { data: perfilRow, error: perfilError } = await supabaseAdmin
    .from('perfis')
    .select('id')
    .eq('nome', perfil)
    .single();

  if (perfilError || !perfilRow) {
    return jsonResponse({ error: 'Perfil não encontrado no banco.' }, 500);
  }

  const { data: existingUser } = await supabaseAdmin
    .from('usuarios')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingUser) {
    return jsonResponse(
      { error: 'Já existe um usuário cadastrado com este e-mail.' },
      409,
    );
  }

  const { data: authCreated, error: authCreateError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authCreateError || !authCreated.user) {
    const msg = authCreateError?.message?.toLowerCase() ?? '';
    if (msg.includes('already') || msg.includes('registered')) {
      return jsonResponse(
        { error: 'Já existe um usuário cadastrado com este e-mail.' },
        409,
      );
    }
    return jsonResponse(
      { error: 'Não foi possível criar a credencial do usuário.' },
      500,
    );
  }

  const newUserId = authCreated.user.id;

  const { data: usuarioCreated, error: usuarioInsertError } = await supabaseAdmin
    .from('usuarios')
    .insert({
      id: newUserId,
      nome,
      email,
      perfil_id: perfilRow.id,
      ativo: true,
    })
    .select('id, nome, email, perfil_id, ativo, inativado_em, criado_em')
    .single();

  if (usuarioInsertError || !usuarioCreated) {
    await supabaseAdmin.auth.admin.deleteUser(newUserId);
    if (usuarioInsertError?.code === '23505') {
      return jsonResponse(
        { error: 'Já existe um usuário cadastrado com este e-mail.' },
        409,
      );
    }
    return jsonResponse(
      { error: 'Não foi possível gravar o usuário no banco.' },
      500,
    );
  }

  if (projetoIds.length > 0) {
    const { data: activeProjects, error: projectsError } = await supabaseAdmin
      .from('projetos')
      .select('id')
      .eq('ativo', true)
      .in('id', projetoIds);

    if (projectsError) {
      await supabaseAdmin.from('usuarios').delete().eq('id', newUserId);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return jsonResponse(
        { error: 'Não foi possível validar os projetos selecionados.' },
        500,
      );
    }

    const links = (activeProjects ?? []).map((p) => ({
      usuario_id: newUserId,
      projeto_id: p.id,
    }));

    if (links.length > 0) {
      const { error: linkError } = await supabaseAdmin
        .from('usuario_projetos')
        .insert(links);

      if (linkError) {
        await supabaseAdmin.from('usuarios').delete().eq('id', newUserId);
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        return jsonResponse(
          { error: 'Não foi possível vincular os projetos ao usuário.' },
          500,
        );
      }
    }
  }

  return jsonResponse(
    {
      ...usuarioCreated,
      perfil,
    },
    201,
  );
});
