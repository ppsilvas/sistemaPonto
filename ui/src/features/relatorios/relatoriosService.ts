import type { SupabaseClient } from '@supabase/supabase-js';
import {
  calculateDurationSeconds,
  endOfLocalDayToUtcIso,
  startOfLocalDayToUtcIso,
} from '../../lib/dateTime';

export type RelatorioStatusFilter =
  | 'todos'
  | 'em_andamento'
  | 'encerrados'
  | 'editados';

export interface RelatorioFiltros {
  usuarioId: string;
  projetoId: string;
  dataInicial: string;
  dataFinal: string;
  status: RelatorioStatusFilter;
  incluirExcluidos: boolean;
}

export interface RelatorioUsuarioOption {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface RelatorioProjetoOption {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface RelatorioFilterOptions {
  usuarios: RelatorioUsuarioOption[];
  projetos: RelatorioProjetoOption[];
}

export interface RegistroPontoRelatorio {
  id: string;
  usuario_id: string;
  usuario_nome: string;
  usuario_ativo: boolean;
  projeto_id: string;
  projeto_nome: string;
  projeto_ativo: boolean;
  horario_entrada: string;
  horario_saida: string | null;
  observacoes: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
  atualizado_por_nome: string | null;
  excluido_em: string | null;
  excluido_por: string | null;
  excluido_por_nome: string | null;
  duracao_segundos: number;
  em_andamento: boolean;
  excluido: boolean;
  alerta_longa_duracao: boolean;
}

export interface ResumoAgrupadoItem {
  id: string;
  nome: string;
  ativo: boolean;
  total_segundos: number;
  quantidade_sessoes: number;
}

export interface RelatorioResumo {
  total_segundos: number;
  total_registros: number;
  sessoes_em_andamento: number;
  horas_por_projeto: ResumoAgrupadoItem[];
  horas_por_usuario: ResumoAgrupadoItem[];
}

export interface RelatorioResultado {
  registros: RegistroPontoRelatorio[];
  resumo: RelatorioResumo;
}

export const LONG_OPEN_SESSION_SECONDS = 12 * 3600;

interface RelatorioRegistroRow {
  id: string;
  usuario_id: string;
  projeto_id: string;
  horario_entrada: string;
  horario_saida: string | null;
  observacoes: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
  excluido_em: string | null;
  excluido_por: string | null;
  usuarios:
    | RelatorioUsuarioOption
    | RelatorioUsuarioOption[]
    | null;
  projetos:
    | RelatorioProjetoOption
    | RelatorioProjetoOption[]
    | null;
}

function extractRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function listRelatorioFilterOptions(
  client: SupabaseClient,
): Promise<RelatorioFilterOptions> {
  const [usuariosRes, projetosRes] = await Promise.all([
    client.from('usuarios').select('id, nome, ativo').order('nome', { ascending: true }),
    client.from('projetos').select('id, nome, ativo').order('nome', { ascending: true }),
  ]);

  if (usuariosRes.error) {
    throw new Error('Não foi possível carregar a lista de usuários.');
  }
  if (projetosRes.error) {
    throw new Error('Não foi possível carregar a lista de projetos.');
  }

  return {
    usuarios: (usuariosRes.data ?? []) as RelatorioUsuarioOption[],
    projetos: (projetosRes.data ?? []) as RelatorioProjetoOption[],
  };
}

export function summarizeRelatorioRegistros(
  registros: RegistroPontoRelatorio[],
): RelatorioResumo {
  let totalSegundos = 0;
  let sessoesEmAndamento = 0;

  const porProjeto = new Map<string, ResumoAgrupadoItem>();
  const porUsuario = new Map<string, ResumoAgrupadoItem>();

  for (const registro of registros) {
    if (registro.excluido) {
      continue;
    }

    if (registro.em_andamento) {
      sessoesEmAndamento += 1;
      continue;
    }

    totalSegundos += registro.duracao_segundos;

    const projItem = porProjeto.get(registro.projeto_id) ?? {
      id: registro.projeto_id,
      nome: registro.projeto_nome,
      ativo: registro.projeto_ativo,
      total_segundos: 0,
      quantidade_sessoes: 0,
    };
    projItem.total_segundos += registro.duracao_segundos;
    projItem.quantidade_sessoes += 1;
    porProjeto.set(registro.projeto_id, projItem);

    const userItem = porUsuario.get(registro.usuario_id) ?? {
      id: registro.usuario_id,
      nome: registro.usuario_nome,
      ativo: registro.usuario_ativo,
      total_segundos: 0,
      quantidade_sessoes: 0,
    };
    userItem.total_segundos += registro.duracao_segundos;
    userItem.quantidade_sessoes += 1;
    porUsuario.set(registro.usuario_id, userItem);
  }

  const sortResumo = (a: ResumoAgrupadoItem, b: ResumoAgrupadoItem) => {
    if (b.total_segundos !== a.total_segundos) {
      return b.total_segundos - a.total_segundos;
    }
    return a.nome.localeCompare(b.nome, 'pt-BR');
  };

  return {
    total_segundos: totalSegundos,
    total_registros: registros.length,
    sessoes_em_andamento: sessoesEmAndamento,
    horas_por_projeto: Array.from(porProjeto.values()).sort(sortResumo),
    horas_por_usuario: Array.from(porUsuario.values()).sort(sortResumo),
  };
}

export async function fetchRelatorioPontos(
  client: SupabaseClient,
  filtros: RelatorioFiltros,
  options?: {
    usuariosNomeMap?: Map<string, string>;
    nowMs?: number;
  },
): Promise<RelatorioResultado> {
  if (filtros.dataInicial > filtros.dataFinal) {
    throw new Error('A data inicial não pode ser maior que a data final.');
  }

  const inicioUtc = startOfLocalDayToUtcIso(filtros.dataInicial);
  const fimUtc = endOfLocalDayToUtcIso(filtros.dataFinal);

  let query = client
    .from('registros_ponto')
    .select(
      'id, usuario_id, projeto_id, horario_entrada, horario_saida, observacoes, atualizado_em, atualizado_por, excluido_em, excluido_por, usuarios!registros_ponto_usuario_id_fkey(id, nome, ativo), projetos(id, nome, ativo)',
    )
    .gte('horario_entrada', inicioUtc)
    .lte('horario_entrada', fimUtc)
    .order('horario_entrada', { ascending: false });

  if (filtros.usuarioId && filtros.usuarioId !== 'todos') {
    query = query.eq('usuario_id', filtros.usuarioId);
  }

  if (filtros.projetoId && filtros.projetoId !== 'todos') {
    query = query.eq('projeto_id', filtros.projetoId);
  }

  if (!filtros.incluirExcluidos) {
    query = query.is('excluido_em', null);
  }

  if (filtros.status === 'em_andamento') {
    query = query.is('horario_saida', null);
  } else if (filtros.status === 'encerrados') {
    query = query.not('horario_saida', 'is', null);
  } else if (filtros.status === 'editados') {
    query = query.not('atualizado_em', 'is', null);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error('Não foi possível carregar os registros de ponto.');
  }

  const rows = (data ?? []) as RelatorioRegistroRow[];
  const nomeMap = new Map<string, string>(options?.usuariosNomeMap ?? []);

  const missingAdminIds = new Set<string>();
  for (const row of rows) {
    const autor = extractRelation(row.usuarios);
    if (autor && !nomeMap.has(autor.id)) {
      nomeMap.set(autor.id, autor.nome);
    }
    if (row.atualizado_por && !nomeMap.has(row.atualizado_por)) {
      missingAdminIds.add(row.atualizado_por);
    }
    if (row.excluido_por && !nomeMap.has(row.excluido_por)) {
      missingAdminIds.add(row.excluido_por);
    }
  }

  if (missingAdminIds.size > 0) {
    const { data: adminRows } = await client
      .from('usuarios')
      .select('id, nome')
      .in('id', Array.from(missingAdminIds));

    for (const admin of (adminRows ?? []) as Array<{ id: string; nome: string }>) {
      nomeMap.set(admin.id, admin.nome);
    }
  }

  const nowMs = options?.nowMs ?? Date.now();

  const registros: RegistroPontoRelatorio[] = rows.map((row) => {
    const usuario = extractRelation(row.usuarios);
    const projeto = extractRelation(row.projetos);
    const emAndamento = row.horario_saida === null;
    const excluido = row.excluido_em !== null;
    const duracaoSegundos = calculateDurationSeconds(
      row.horario_entrada,
      row.horario_saida,
      nowMs,
    );

    return {
      id: row.id,
      usuario_id: row.usuario_id,
      usuario_nome: usuario?.nome ?? nomeMap.get(row.usuario_id) ?? 'Usuário',
      usuario_ativo: usuario?.ativo ?? true,
      projeto_id: row.projeto_id,
      projeto_nome: projeto?.nome ?? 'Projeto',
      projeto_ativo: projeto?.ativo ?? true,
      horario_entrada: row.horario_entrada,
      horario_saida: row.horario_saida,
      observacoes: row.observacoes,
      atualizado_em: row.atualizado_em,
      atualizado_por: row.atualizado_por,
      atualizado_por_nome: row.atualizado_por
        ? (nomeMap.get(row.atualizado_por) ?? 'Administrador')
        : null,
      excluido_em: row.excluido_em,
      excluido_por: row.excluido_por,
      excluido_por_nome: row.excluido_por
        ? (nomeMap.get(row.excluido_por) ?? 'Administrador')
        : null,
      duracao_segundos: duracaoSegundos,
      em_andamento: emAndamento,
      excluido,
      alerta_longa_duracao:
        emAndamento && !excluido && duracaoSegundos > LONG_OPEN_SESSION_SECONDS,
    };
  });

  return {
    registros,
    resumo: summarizeRelatorioRegistros(registros),
  };
}

export interface EditarPontoAdminParams {
  registroId: string;
  projetoId: string;
  horarioEntrada: string;
  horarioSaida: string | null;
  observacoes?: string | null;
}

interface RpcErrorLike {
  code?: string;
  message?: string;
}

function mapAdminPontoRpcError(
  error: RpcErrorLike,
  action: 'editar' | 'excluir',
): string {
  const code = error.code ?? '';
  const message = error.message ?? '';

  if (code === '42501' || message.includes('FORBIDDEN')) {
    return action === 'editar'
      ? 'Apenas administradores podem editar registros de ponto.'
      : 'Apenas administradores podem excluir registros de ponto.';
  }

  if (
    code === '22007' ||
    message.includes('INVALID_CHRONOLOGY') ||
    message.includes('chk_registros_ponto_cronologia')
  ) {
    return 'O horário de saída não pode ser anterior ao horário de entrada.';
  }

  if (
    code === '23505' ||
    message.includes('uq_registros_ponto_sessao_ativa')
  ) {
    return 'Não é possível reabrir este registro porque o usuário já possui outro ponto em andamento.';
  }

  if (code === 'P0001' || message.includes('RECORD_NOT_FOUND')) {
    return 'Registro de ponto não encontrado ou já foi excluído.';
  }

  return action === 'editar'
    ? 'Não foi possível salvar as alterações do registro de ponto.'
    : 'Não foi possível excluir o registro de ponto.';
}

export async function listUsuarioProjetosIds(
  client: SupabaseClient,
  usuarioId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from('usuario_projetos')
    .select('projeto_id')
    .eq('usuario_id', usuarioId);

  if (error) {
    throw new Error('Não foi possível carregar os projetos vinculados ao usuário.');
  }

  return ((data ?? []) as Array<{ projeto_id: string }>).map(
    (row) => row.projeto_id,
  );
}

export async function editarPontoAdmin(
  client: SupabaseClient,
  params: EditarPontoAdminParams,
): Promise<void> {
  const observacoesNormalizadas = params.observacoes?.trim()
    ? params.observacoes.trim()
    : null;

  const { error } = await client.rpc('editar_ponto_admin', {
    p_registro_id: params.registroId,
    p_projeto_id: params.projetoId,
    p_horario_entrada: params.horarioEntrada,
    p_horario_saida: params.horarioSaida,
    p_observacoes: observacoesNormalizadas,
  });

  if (error) {
    throw new Error(mapAdminPontoRpcError(error, 'editar'));
  }
}

export async function excluirPontoAdmin(
  client: SupabaseClient,
  registroId: string,
): Promise<void> {
  const { error } = await client.rpc('excluir_ponto_admin', {
    p_registro_id: registroId,
  });

  if (error) {
    throw new Error(mapAdminPontoRpcError(error, 'excluir'));
  }
}
