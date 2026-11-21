import type { SupabaseClient } from '@supabase/supabase-js';
import {
  endOfLocalDayToUtcIso,
  startOfLocalDayToUtcIso,
  sumClosedSessionsDurationSeconds,
} from '../../lib/dateTime';
import type { RegistroPonto } from '../../types/domain';

export interface HistoricoProjetoOption {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface HistoricoRegistroItem extends RegistroPonto {
  projeto_nome: string;
  projeto_ativo: boolean;
}

export interface HistoricoFiltros {
  userId: string;
  projetoId?: string;
  startDate: string;
  endDate: string;
}

export interface HistoricoQueryResult {
  items: HistoricoRegistroItem[];
  totalItems: number;
  totalClosedSeconds: number;
  closedCount: number;
  activeCount: number;
}

interface ProjectJoinValue {
  id: string;
  nome: string;
  ativo: boolean;
}

interface LinkedProjectFilterRow {
  projeto_id: string;
  projetos: ProjectJoinValue | ProjectJoinValue[] | null;
}

interface RegistroHistoricoRow extends RegistroPonto {
  projetos: ProjectJoinValue | ProjectJoinValue[] | null;
}

function extractRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchHistoricoProjects(
  client: SupabaseClient,
  userId: string,
): Promise<HistoricoProjetoOption[]> {
  const [linkedResult, historyResult] = await Promise.all([
    client
      .from('usuario_projetos')
      .select('projeto_id, projetos!inner(id, nome, ativo)')
      .eq('usuario_id', userId),
    client
      .from('registros_ponto')
      .select('projeto_id, projetos(id, nome, ativo)')
      .eq('usuario_id', userId)
      .is('excluido_em', null),
  ]);

  if (linkedResult.error || historyResult.error) {
    throw new Error('Não foi possível carregar os projetos para filtro.');
  }

  const map = new Map<string, HistoricoProjetoOption>();

  for (const row of (linkedResult.data ?? []) as LinkedProjectFilterRow[]) {
    const projeto = extractRelation(row.projetos);
    if (projeto) {
      map.set(projeto.id, {
        id: projeto.id,
        nome: projeto.nome,
        ativo: projeto.ativo,
      });
    }
  }

  for (const row of (historyResult.data ?? []) as LinkedProjectFilterRow[]) {
    const projeto = extractRelation(row.projetos);
    if (projeto && !map.has(projeto.id)) {
      map.set(projeto.id, {
        id: projeto.id,
        nome: projeto.nome,
        ativo: projeto.ativo,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

export async function fetchHistoricoRegistros(
  client: SupabaseClient,
  filtros: HistoricoFiltros,
): Promise<HistoricoQueryResult> {
  const startUtcIso = startOfLocalDayToUtcIso(filtros.startDate);
  const endUtcIso = endOfLocalDayToUtcIso(filtros.endDate);

  let query = client
    .from('registros_ponto')
    .select(
      'id, usuario_id, projeto_id, horario_entrada, horario_saida, observacoes, atualizado_em, atualizado_por, excluido_em, excluido_por, projetos(id, nome, ativo)',
    )
    .eq('usuario_id', filtros.userId)
    .is('excluido_em', null)
    .gte('horario_entrada', startUtcIso)
    .lte('horario_entrada', endUtcIso)
    .order('horario_entrada', { ascending: false });

  if (filtros.projetoId) {
    query = query.eq('projeto_id', filtros.projetoId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error('Não foi possível carregar seu histórico de pontos.');
  }

  const rows = (data ?? []) as RegistroHistoricoRow[];
  const items: HistoricoRegistroItem[] = rows.map((row) => {
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
      projeto_ativo: projeto?.ativo ?? true,
    };
  });

  const totalClosedSeconds = sumClosedSessionsDurationSeconds(items);
  const activeCount = items.filter((item) => item.horario_saida === null).length;
  const closedCount = items.length - activeCount;

  return {
    items,
    totalItems: items.length,
    totalClosedSeconds,
    closedCount,
    activeCount,
  };
}
