import type { SupabaseClient } from '@supabase/supabase-js';
import type { Projeto, RegistroPonto } from '../../types/domain';

export type PontoErrorCode =
  | 'ACTIVE_SESSION_EXISTS'
  | 'PROJECT_NOT_LINKED'
  | 'NO_ACTIVE_SESSION'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

export class PontoError extends Error {
  readonly code: PontoErrorCode;

  constructor(code: PontoErrorCode, message: string) {
    super(message);
    this.name = 'PontoError';
    this.code = code;
  }
}

export interface SessaoPontoAtiva extends RegistroPonto {
  projeto_nome: string;
}

export interface SessaoPontoResumo extends RegistroPonto {
  projeto_nome: string;
}

interface LinkedProjectRow {
  projeto_id: string;
  projetos: Projeto | Projeto[] | null;
}

interface ActiveSessionRow extends RegistroPonto {
  projetos: { id: string; nome: string } | Array<{ id: string; nome: string }> | null;
}

function extractRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchLinkedActiveProjects(
  client: SupabaseClient,
  userId: string,
): Promise<Projeto[]> {
  const { data, error } = await client
    .from('usuario_projetos')
    .select(
      'projeto_id, projetos!inner(id, nome, descricao, ativo, inativado_em, criado_em)',
    )
    .eq('usuario_id', userId)
    .eq('projetos.ativo', true);

  if (error) {
    throw new Error('Não foi possível carregar seus projetos vinculados.');
  }

  const projects: Projeto[] = [];
  for (const row of (data ?? []) as LinkedProjectRow[]) {
    const projeto = extractRelation(row.projetos);
    if (projeto && projeto.ativo) {
      projects.push(projeto);
    }
  }

  return projects.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function mapSessionRow(row: ActiveSessionRow): SessaoPontoAtiva {
  const projeto = extractRelation(row.projetos);
  return {
    id: row.id,
    usuario_id: row.usuario_id,
    projeto_id: row.projeto_id,
    horario_entrada: row.horario_entrada,
    horario_saida: row.horario_saida,
    observacoes: row.observacoes,
    atualizado_em: row.atualizado_em,
    atualizado_por: row.atualizado_por,
    excluido_em: row.excluido_em,
    excluido_por: row.excluido_por,
    projeto_nome: projeto?.nome ?? 'Projeto',
  };
}

export async function fetchActiveSession(
  client: SupabaseClient,
  userId: string,
): Promise<SessaoPontoAtiva | null> {
  const { data, error } = await client
    .from('registros_ponto')
    .select(
      'id, usuario_id, projeto_id, horario_entrada, horario_saida, observacoes, atualizado_em, atualizado_por, excluido_em, excluido_por, projetos(id, nome)',
    )
    .eq('usuario_id', userId)
    .is('horario_saida', null)
    .is('excluido_em', null)
    .maybeSingle<ActiveSessionRow>();

  if (error) {
    throw new Error('Não foi possível verificar sua sessão de ponto ativa.');
  }

  if (!data) {
    return null;
  }

  return mapSessionRow(data);
}

export async function fetchTodaySessions(
  client: SupabaseClient,
  userId: string,
): Promise<SessaoPontoResumo[]> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const { data, error } = await client
    .from('registros_ponto')
    .select(
      'id, usuario_id, projeto_id, horario_entrada, horario_saida, observacoes, atualizado_em, atualizado_por, excluido_em, excluido_por, projetos(id, nome)',
    )
    .eq('usuario_id', userId)
    .is('excluido_em', null)
    .not('horario_saida', 'is', null)
    .gte('horario_entrada', startOfToday.toISOString())
    .order('horario_entrada', { ascending: false });

  if (error) {
    throw new Error('Não foi possível carregar as sessões de hoje.');
  }

  return ((data ?? []) as ActiveSessionRow[]).map(mapSessionRow);
}

export async function iniciarPonto(
  client: SupabaseClient,
  projetoId: string,
  observacoes?: string | null,
): Promise<RegistroPonto> {
  const normalizedObs = observacoes?.trim() ? observacoes.trim() : null;

  const { data, error } = await client.rpc('iniciar_ponto', {
    p_projeto_id: projetoId,
    p_observacoes: normalizedObs,
  });

  if (error || !data) {
    const msg = error?.message ?? '';
    if (msg.includes('ACTIVE_SESSION_EXISTS')) {
      throw new PontoError(
        'ACTIVE_SESSION_EXISTS',
        'Você já possui um ponto em aberto.',
      );
    }
    if (msg.includes('PROJECT_NOT_LINKED') || msg.includes('PROJECT_INACTIVE')) {
      throw new PontoError(
        'PROJECT_NOT_LINKED',
        'Este projeto não está mais ativo ou vinculado a você.',
      );
    }
    if (msg.includes('UNAUTHORIZED')) {
      throw new PontoError(
        'UNAUTHORIZED',
        'Sessão expirada ou usuário inativo.',
      );
    }
    throw new PontoError(
      'UNKNOWN',
      'Não foi possível iniciar o ponto. Verifique sua conexão e tente novamente.',
    );
  }

  return data as RegistroPonto;
}

export async function pausarPonto(
  client: SupabaseClient,
  observacoes?: string | null,
): Promise<RegistroPonto> {
  const normalizedObs = observacoes?.trim() ? observacoes.trim() : null;

  const { data, error } = await client.rpc('pausar_ponto', {
    p_observacoes: normalizedObs,
  });

  if (error || !data) {
    const msg = error?.message ?? '';
    if (msg.includes('NO_ACTIVE_SESSION')) {
      throw new PontoError(
        'NO_ACTIVE_SESSION',
        'Esta sessão de ponto já foi encerrada anteriormente.',
      );
    }
    if (msg.includes('UNAUTHORIZED')) {
      throw new PontoError(
        'UNAUTHORIZED',
        'Sessão expirada ou usuário inativo.',
      );
    }
    throw new PontoError(
      'UNKNOWN',
      'Não foi possível encerrar o ponto. Verifique sua conexão e tente novamente.',
    );
  }

  return data as RegistroPonto;
}
