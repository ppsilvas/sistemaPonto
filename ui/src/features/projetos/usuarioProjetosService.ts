import type { SupabaseClient } from '@supabase/supabase-js';
import type { PerfilNome } from '../../types/domain';

export interface UsuarioVinculado {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  perfil: PerfilNome;
}

export interface UsuarioElegivel {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilNome;
}

type PerfisRelation = { nome: PerfilNome } | Array<{ nome: PerfilNome }> | null;

interface UsuarioVinculoRow {
  usuario_id: string;
  usuarios:
    | {
        id: string;
        nome: string;
        email: string;
        ativo: boolean;
        perfis: PerfisRelation;
      }
    | Array<{
        id: string;
        nome: string;
        email: string;
        ativo: boolean;
        perfis: PerfisRelation;
      }>
    | null;
}

interface UsuarioElegivelRow {
  id: string;
  nome: string;
  email: string;
  perfis: PerfisRelation;
}

function extractPerfil(perfis: PerfisRelation): PerfilNome {
  if (Array.isArray(perfis)) {
    return perfis[0]?.nome ?? 'worker';
  }
  return perfis?.nome ?? 'worker';
}

export async function listVinculosProjeto(
  client: SupabaseClient,
  projetoId: string,
): Promise<UsuarioVinculado[]> {
  const { data, error } = await client
    .from('usuario_projetos')
    .select(
      'usuario_id, usuarios!usuario_projetos_usuario_id_fkey(id, nome, email, ativo, perfis(nome))',
    )
    .eq('projeto_id', projetoId);

  if (error) {
    throw new Error('Não foi possível carregar os usuários vinculados.');
  }

  const result: UsuarioVinculado[] = [];
  for (const row of (data ?? []) as UsuarioVinculoRow[]) {
    const user = Array.isArray(row.usuarios) ? row.usuarios[0] : row.usuarios;
    if (!user) continue;
    result.push({
      id: user.id,
      nome: user.nome,
      email: user.email,
      ativo: user.ativo,
      perfil: extractPerfil(user.perfis),
    });
  }

  return result.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function listUsuariosAtivosElegiveis(
  client: SupabaseClient,
): Promise<UsuarioElegivel[]> {
  const { data, error } = await client
    .from('usuarios')
    .select('id, nome, email, perfis(nome)')
    .eq('ativo', true)
    .order('nome', { ascending: true });

  if (error) {
    throw new Error('Não foi possível carregar os usuários ativos.');
  }

  return ((data ?? []) as UsuarioElegivelRow[]).map((row) => ({
    id: row.id,
    nome: row.nome,
    email: row.email,
    perfil: extractPerfil(row.perfis),
  }));
}

export async function hasOpenSessionInProject(
  client: SupabaseClient,
  usuarioId: string,
  projetoId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('registros_ponto')
    .select('id')
    .eq('usuario_id', usuarioId)
    .eq('projeto_id', projetoId)
    .is('horario_saida', null)
    .is('excluido_em', null)
    .limit(1);

  if (error) {
    throw new Error(
      'Não foi possível verificar sessão em aberto do usuário neste projeto.',
    );
  }

  return (data ?? []).length > 0;
}

export async function vincularUsuariosAoProjeto(
  client: SupabaseClient,
  projetoId: string,
  usuarioIds: string[],
): Promise<void> {
  const uniqueIds = Array.from(new Set(usuarioIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  const rows = uniqueIds.map((usuarioId) => ({
    usuario_id: usuarioId,
    projeto_id: projetoId,
  }));

  const { error } = await client
    .from('usuario_projetos')
    .upsert(rows, { onConflict: 'usuario_id,projeto_id', ignoreDuplicates: true });

  if (error) {
    throw new Error('Não foi possível vincular os usuários ao projeto.');
  }
}

export async function desvincularUsuarioDoProjeto(
  client: SupabaseClient,
  usuarioId: string,
  projetoId: string,
): Promise<void> {
  const hasOpen = await hasOpenSessionInProject(client, usuarioId, projetoId);
  if (hasOpen) {
    throw new Error(
      'Não é possível desvincular este usuário enquanto houver um ponto em aberto neste projeto. Peça ao usuário para pausar ou encerre o ponto administrativamente antes.',
    );
  }

  const { error } = await client
    .from('usuario_projetos')
    .delete()
    .eq('usuario_id', usuarioId)
    .eq('projeto_id', projetoId);

  if (error) {
    throw new Error('Não foi possível desvincular o usuário do projeto.');
  }
}

export async function syncProjetosDoUsuario(
  client: SupabaseClient,
  usuarioId: string,
  currentProjetoIds: string[],
  nextProjetoIds: string[],
): Promise<void> {
  const currentSet = new Set(currentProjetoIds);
  const nextSet = new Set(nextProjetoIds);

  const toRemove = currentProjetoIds.filter((id) => !nextSet.has(id));
  const toAdd = nextProjetoIds.filter((id) => !currentSet.has(id));

  for (const projetoId of toRemove) {
    await desvincularUsuarioDoProjeto(client, usuarioId, projetoId);
  }

  if (toAdd.length > 0) {
    const rows = toAdd.map((projetoId) => ({
      usuario_id: usuarioId,
      projeto_id: projetoId,
    }));
    const { error } = await client
      .from('usuario_projetos')
      .upsert(rows, {
        onConflict: 'usuario_id,projeto_id',
        ignoreDuplicates: true,
      });

    if (error) {
      throw new Error('Não foi possível atualizar os vínculos de projetos.');
    }
  }
}
