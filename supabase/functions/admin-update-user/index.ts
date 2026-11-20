import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface UpdateUserPayload {
  userId?: unknown;
  nome?: unknown;
  email?: unknown;
  perfil?: unknown;
  ativo?: unknown;
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
      { error: 'Apenas administradores ativos podem editar usuários.' },
      403,
    );
  }

  let body: UpdateUserPayload;
  try {
    body = (await req.json()) as UpdateUserPayload;
  } catch {
    return jsonResponse({ error: 'Corpo JSON inválido.' }, 400);
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const perfil =
    body.perfil === 'admin' || body.perfil === 'worker' ? body.perfil : null;
  const ativo = typeof body.ativo === 'boolean' ? body.ativo : null;

  if (!userId) {
    return jsonResponse({ error: 'ID do usuário é obrigatório.' }, 400);
  }
  if (!nome) {
    return jsonResponse({ error: 'O nome completo é obrigatório.' }, 400);
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return jsonResponse({ error: 'Informe um e-mail válido.' }, 400);
  }
  if (!perfil) {
    return jsonResponse({ error: 'Perfil inválido.' }, 400);
  }
  if (ativo === null) {
    return jsonResponse({ error: 'Status ativo inválido.' }, 400);
  }

  const { data: currentTarget, error: targetError } = await supabaseAdmin
    .from('usuarios')
    .select('id, nome, email, perfil_id, ativo')
    .eq('id', userId)
    .maybeSingle();

  if (targetError || !currentTarget) {
    return jsonResponse({ error: 'Usuário não encontrado.' }, 404);
  }

  const { data: perfilRow, error: perfilError } = await supabaseAdmin
    .from('perfis')
    .select('id')
    .eq('nome', perfil)
    .single();

  if (perfilError || !perfilRow) {
    return jsonResponse({ error: 'Perfil não encontrado no banco.' }, 500);
  }

  if (email !== currentTarget.email.toLowerCase()) {
    const { data: duplicateUser } = await supabaseAdmin
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .neq('id', userId)
      .maybeSingle();

    if (duplicateUser) {
      return jsonResponse(
        { error: 'Este e-mail já está em uso por outro usuário.' },
        409,
      );
    }
  }

  const { data: updatedUser, error: updateError } = await supabaseAdmin
    .from('usuarios')
    .update({
      nome,
      email,
      perfil_id: perfilRow.id,
      ativo,
    })
    .eq('id', userId)
    .select('id, nome, email, perfil_id, ativo, inativado_em, criado_em')
    .single();

  if (updateError || !updatedUser) {
    const msg = updateError?.message ?? '';
    if (msg.includes('LAST_ADMIN_PROTECTED')) {
      return jsonResponse(
        {
          error:
            'Não é possível inativar, excluir ou alterar o perfil do único administrador ativo do sistema.',
        },
        409,
      );
    }
    if (updateError?.code === '23505') {
      return jsonResponse(
        { error: 'Este e-mail já está em uso por outro usuário.' },
        409,
      );
    }
    return jsonResponse(
      { error: 'Não foi possível atualizar o usuário.' },
      500,
    );
  }

  const authUpdatePayload: {
    email?: string;
    email_confirm?: boolean;
    ban_duration: string;
  } = {
    ban_duration: ativo ? 'none' : '876000h',
  };

  if (email !== currentTarget.email.toLowerCase()) {
    authUpdatePayload.email = email;
    authUpdatePayload.email_confirm = true;
  }

  const { error: authUpdateError } =
    await supabaseAdmin.auth.admin.updateUserById(userId, authUpdatePayload);

  if (authUpdateError) {
    // Rollback compensatório em public.usuarios
    await supabaseAdmin
      .from('usuarios')
      .update({
        nome: currentTarget.nome,
        email: currentTarget.email,
        perfil_id: currentTarget.perfil_id,
        ativo: currentTarget.ativo,
      })
      .eq('id', userId);

    const authMsg = authUpdateError.message?.toLowerCase() ?? '';
    if (authMsg.includes('already') || authMsg.includes('registered')) {
      return jsonResponse(
        { error: 'Este e-mail já está em uso por outro usuário.' },
        409,
      );
    }
    return jsonResponse(
      { error: 'Falha ao sincronizar atualização no Supabase Auth.' },
      500,
    );
  }

  return jsonResponse(
    {
      ...updatedUser,
      perfil,
    },
    200,
  );
});
