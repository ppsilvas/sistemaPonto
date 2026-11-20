import type { SupabaseClient } from '@supabase/supabase-js';
import type { Projeto } from '../../types/domain';

export interface ProjetoComContagem extends Projeto {
  usuarios_vinculados_count: number;
  registros_count: number;
}

export interface ProjetoInput {
  nome: string;
  descricao?: string | null;
}

interface ProjetoQueryRow extends Projeto {
  usuario_projetos?: Array<{ count: number }>;
  registros_ponto?: Array<{ count: number }>;
}

interface SessaoAbertaRow {
  id: string;
  usuarios: { nome: string } | Array<{ nome: string }> | null;
}

function normalizeProjetoInput(input: ProjetoInput): {
  nome: string;
  descricao: string | null;
} {
  const nome = input.nome.trim();
  if (!nome) {
    throw new Error('O nome do projeto é obrigatório.');
  }
  const descTrimmed = input.descricao?.trim() ?? '';
  return {
    nome,
    descricao: descTrimmed ? descTrimmed : null,
  };
}

export async function listProjetos(
  client: SupabaseClient,
): Promise<ProjetoComContagem[]> {
  const { data, error } = await client
    .from('projetos')
    .select(
      'id, nome, descricao, ativo, inativado_em, criado_em, usuario_projetos(count), registros_ponto(count)',
    )
    .order('criado_em', { ascending: false });

  if (error) {
    throw new Error('Não foi possível carregar os projetos.');
  }

  return ((data ?? []) as ProjetoQueryRow[]).map((row) => ({
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    ativo: row.ativo,
    inativado_em: row.inativado_em,
    criado_em: row.criado_em,
    usuarios_vinculados_count: row.usuario_projetos?.[0]?.count ?? 0,
    registros_count: row.registros_ponto?.[0]?.count ?? 0,
  }));
}

export async function createProjeto(
  client: SupabaseClient,
  input: ProjetoInput,
): Promise<Projeto> {
  const payload = normalizeProjetoInput(input);
  const { data, error } = await client
    .from('projetos')
    .insert(payload)
    .select('id, nome, descricao, ativo, inativado_em, criado_em')
    .single<Projeto>();

  if (error || !data) {
    throw new Error('Não foi possível cadastrar o projeto.');
  }

  return data;
}

export async function updateProjeto(
  client: SupabaseClient,
  projetoId: string,
  input: ProjetoInput,
): Promise<Projeto> {
  const payload = normalizeProjetoInput(input);
  const { data, error } = await client
    .from('projetos')
    .update(payload)
    .eq('id', projetoId)
    .select('id, nome, descricao, ativo, inativado_em, criado_em')
    .single<Projeto>();

  if (error || !data) {
    throw new Error('Não foi possível atualizar o projeto.');
  }

  return data;
}

export async function listSessoesAbertasNoProjeto(
  client: SupabaseClient,
  projetoId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from('registros_ponto')
    .select('id, usuarios(nome)')
    .eq('projeto_id', projetoId)
    .is('horario_saida', null)
    .is('excluido_em', null);

  if (error) {
    throw new Error(
      'Não foi possível verificar sessões abertas para este projeto.',
    );
  }

  return ((data ?? []) as SessaoAbertaRow[]).map((row) => {
    if (Array.isArray(row.usuarios)) {
      return row.usuarios[0]?.nome ?? 'Usuário';
    }
    return row.usuarios?.nome ?? 'Usuário';
  });
}

async function ensureNoOpenSessions(
  client: SupabaseClient,
  projetoId: string,
): Promise<void> {
  const openUsers = await listSessoesAbertasNoProjeto(client, projetoId);
  if (openUsers.length > 0) {
    throw new Error(
      `Não é possível concluir a ação: há sessão de ponto aberta neste projeto para ${openUsers.join(', ')}.`,
    );
  }
}

export async function inativarProjeto(
  client: SupabaseClient,
  projetoId: string,
): Promise<Projeto> {
  await ensureNoOpenSessions(client, projetoId);

  const { data, error } = await client
    .from('projetos')
    .update({ ativo: false })
    .eq('id', projetoId)
    .select('id, nome, descricao, ativo, inativado_em, criado_em')
    .single<Projeto>();

  if (error || !data) {
    throw new Error('Não foi possível inativar o projeto.');
  }

  return data;
}

export async function reativarProjeto(
  client: SupabaseClient,
  projetoId: string,
): Promise<Projeto> {
  const { data, error } = await client
    .from('projetos')
    .update({ ativo: true })
    .eq('id', projetoId)
    .select('id, nome, descricao, ativo, inativado_em, criado_em')
    .single<Projeto>();

  if (error || !data) {
    throw new Error('Não foi possível reativar o projeto.');
  }

  return data;
}

export async function excluirProjeto(
  client: SupabaseClient,
  projetoId: string,
): Promise<void> {
  await ensureNoOpenSessions(client, projetoId);

  const { error } = await client
    .from('projetos')
    .delete()
    .eq('id', projetoId);

  if (error) {
    if (error.code === '23503') {
      throw new Error(
        'Este projeto já possui registros de ponto vinculados e só pode ser inativado para preservar o histórico.',
      );
    }
    throw new Error('Não foi possível excluir o projeto.');
  }
}
