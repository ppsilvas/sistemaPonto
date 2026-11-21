import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Clock, Download, Info } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState, LoadingState } from '../../components/FeedbackStates';
import { Input } from '../../components/Input';
import { useToast } from '../../components/ToastContext';
import {
  buildCsvFilename,
  buildTimeEntriesCsv,
  downloadCsvFile,
} from '../../lib/csv';
import {
  calculateDurationSeconds,
  formatDurationDecimalHours,
  formatDurationHMS,
  formatDurationHuman,
  formatUtcToLocalDate,
  formatUtcToLocalDateTime,
  getLocalDateRangeForPreset,
  type PeriodPreset,
} from '../../lib/dateTime';
import { getSupabaseClient } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import {
  fetchHistoricoProjects,
  fetchHistoricoRegistros,
  type HistoricoProjetoOption,
  type HistoricoQueryResult,
  type HistoricoRegistroItem,
} from './historicoService';

const PAGE_SIZE = 50;
const OBSERVACOES_TRUNCATE_LENGTH = 80;

const PRESET_OPTIONS: Array<{ id: PeriodPreset; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'this_week', label: 'Esta semana' },
  { id: 'this_month', label: 'Este mês' },
  { id: 'last_month', label: 'Mês anterior' },
];

export interface HistoricoPageProps {
  supabaseClient?: SupabaseClient;
  onExportCsv?: (params: {
    projetoId?: string;
    startDate: string;
    endDate: string;
    items: HistoricoRegistroItem[];
  }) => void;
}

function ObservacoesCell({
  observacoes,
  atualizadoEm,
}: {
  observacoes: string | null;
  atualizadoEm: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = observacoes?.trim() ?? '';
  const isLong = text.length > OBSERVACOES_TRUNCATE_LENGTH;
  const displayedText =
    isLong && !expanded
      ? `${text.slice(0, OBSERVACOES_TRUNCATE_LENGTH)}...`
      : text;

  return (
    <div className="historico-obs-cell">
      {text ? (
        <div className="historico-obs-text">
          <span>{displayedText}</span>
          {isLong ? (
            <button
              type="button"
              className="historico-obs-toggle"
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? 'Ver menos' : 'Ver mais'}
            </button>
          ) : null}
        </div>
      ) : (
        <span className="historico-muted">—</span>
      )}
      {atualizadoEm ? (
        <span className="historico-adjusted-badge">
          <Info size={12} aria-hidden="true" />
          <span>Ajustado pelo administrador</span>
        </span>
      ) : null}
    </div>
  );
}

export function HistoricoPage({
  supabaseClient,
  onExportCsv,
}: HistoricoPageProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const defaultRange = useMemo(() => getLocalDateRangeForPreset('this_month'), []);

  const [projetos, setProjetos] = useState<HistoricoProjetoOption[]>([]);
  const [selectedProjetoId, setSelectedProjetoId] = useState('');
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [currentPage, setCurrentPage] = useState(1);

  const [result, setResult] = useState<HistoricoQueryResult>({
    items: [],
    totalItems: 0,
    totalClosedSeconds: 0,
    closedCount: 0,
    activeCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const getClient = useCallback(
    () => supabaseClient ?? getSupabaseClient(),
    [supabaseClient],
  );

  const dateRangeError = useMemo(() => {
    if (!startDate || !endDate) {
      return 'Informe a data inicial e a data final.';
    }
    if (startDate > endDate) {
      return 'A data inicial não pode ser posterior à data final.';
    }
    return undefined;
  }, [endDate, startDate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadProjects = async () => {
      try {
        const list = await fetchHistoricoProjects(getClient(), user.id);
        if (!cancelled) {
          setProjetos(list);
        }
      } catch (error) {
        if (!cancelled) {
          showToast({
            type: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Não foi possível carregar os projetos.',
          });
        }
      }
    };

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [getClient, showToast, user]);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    if (dateRangeError) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const loadHistorico = async () => {
      setIsLoading(true);
      try {
        const data = await fetchHistoricoRegistros(getClient(), {
          userId: user.id,
          projetoId: selectedProjetoId || undefined,
          startDate,
          endDate,
        });
        if (!cancelled) {
          setResult(data);
          setCurrentPage(1);
        }
      } catch (error) {
        if (!cancelled) {
          showToast({
            type: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Não foi possível carregar seu histórico.',
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadHistorico();

    return () => {
      cancelled = true;
    };
  }, [
    dateRangeError,
    endDate,
    getClient,
    selectedProjetoId,
    showToast,
    startDate,
    user,
  ]);

  const activePreset = useMemo(() => {
    return (
      PRESET_OPTIONS.find((preset) => {
        const range = getLocalDateRangeForPreset(preset.id);
        return range.startDate === startDate && range.endDate === endDate;
      })?.id ?? null
    );
  }, [endDate, startDate]);

  const handleApplyPreset = (preset: PeriodPreset) => {
    const range = getLocalDateRangeForPreset(preset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const handleResetFilters = () => {
    const range = getLocalDateRangeForPreset('this_month');
    setSelectedProjetoId('');
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const totalPages = Math.max(1, Math.ceil(result.items.length / PAGE_SIZE));
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return result.items.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, result.items]);

  const totalFormatted =
    result.totalClosedSeconds === 0
      ? '00:00'
      : `${formatDurationHuman(result.totalClosedSeconds)} (${formatDurationDecimalHours(result.totalClosedSeconds)})`;

  const handleExportCsv = () => {
    if (onExportCsv) {
      onExportCsv({
        projetoId: selectedProjetoId || undefined,
        startDate,
        endDate,
        items: result.items,
      });
      return;
    }

    try {
      const csvContent = buildTimeEntriesCsv(
        result.items.map((item) => ({
          usuarioNome: user?.nome ?? 'Usuário',
          usuarioEmail: user?.email,
          projetoNome: item.projeto_nome,
          horario_entrada: item.horario_entrada,
          horario_saida: item.horario_saida,
          observacoes: item.observacoes,
        })),
        { includeAuditColumns: false },
      );

      const filename = buildCsvFilename({
        startDate,
        endDate,
        userName: user?.nome,
      });

      downloadCsvFile(csvContent, filename);
      showToast({
        type: 'success',
        message: 'Relatório CSV exportado com sucesso.',
      });
    } catch (error) {
      showToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível exportar o arquivo CSV.',
      });
    }
  };

  return (
    <section className="historico-container">
      <div className="page-header">
        <div>
          <h1>Meu Histórico</h1>
          <p className="login-subtitle">
            Consulte seus registros de ponto e acompanhe suas horas por projeto.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          disabled={isLoading || Boolean(dateRangeError) || result.items.length === 0}
          title="Exportar registros filtrados em CSV"
          onClick={handleExportCsv}
        >
          <Download size={16} aria-hidden="true" />
          <span>Exportar CSV</span>
        </Button>
      </div>

      <div className="card historico-filters-card">
        <div className="historico-presets" role="group" aria-label="Atalhos de período">
          {PRESET_OPTIONS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant={activePreset === preset.id ? 'primary' : 'secondary'}
              onClick={() => handleApplyPreset(preset.id)}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="filters-bar-3 historico-filters-grid">
          <div className="field-group">
            <label htmlFor="historico-projeto" className="field-label">
              Projeto
            </label>
            <select
              id="historico-projeto"
              className="field-input"
              value={selectedProjetoId}
              onChange={(event) => setSelectedProjetoId(event.target.value)}
            >
              <option value="">Todos</option>
              {projetos.map((projeto) => (
                <option key={projeto.id} value={projeto.id}>
                  {projeto.ativo ? projeto.nome : `${projeto.nome} (Inativo)`}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Data inicial"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />

          <Input
            label="Data final"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>

        {dateRangeError ? (
          <div className="alert-error" role="alert">
            {dateRangeError}
          </div>
        ) : null}
      </div>

      <div className="card historico-summary-card" aria-label="Resumo do Período Filtrado">
        <div className="historico-summary-main">
          <span className="historico-summary-label">Total de horas acumuladas</span>
          <strong className="historico-summary-total" data-testid="historico-total">
            {totalFormatted}
          </strong>
          {result.totalClosedSeconds > 0 ? (
            <span className="historico-summary-exact">
              Duração exata: {formatDurationHMS(result.totalClosedSeconds)}
            </span>
          ) : null}
        </div>

        <div className="historico-summary-meta">
          <div className="historico-summary-stat">
            <Clock size={16} aria-hidden="true" />
            <span>
              {result.totalItems}{' '}
              {result.totalItems === 1 ? 'sessão no período' : 'sessões no período'}
            </span>
          </div>
          {result.activeCount > 0 ? (
            <div className="historico-active-notice" role="status">
              <Badge variant="success">
                {result.activeCount}{' '}
                {result.activeCount === 1
                  ? 'sessão em andamento'
                  : 'sessões em andamento'}
              </Badge>
              <span className="historico-muted">
                Tempo em aberto ainda não contabilizado no total consolidado.
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="card">
          <LoadingState message="Carregando histórico de pontos..." />
        </div>
      ) : dateRangeError ? null : result.items.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Nenhum registro de ponto encontrado para este período."
            description="Ajuste o projeto ou o intervalo de datas para consultar outros registros."
            action={
              <Button variant="secondary" onClick={handleResetFilters}>
                Limpar filtros
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="card historico-table-desktop">
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Projeto</th>
                    <th>Entrada</th>
                    <th>Saída</th>
                    <th>Duração</th>
                    <th>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item) => {
                    const isOngoing = item.horario_saida === null;
                    const durationSeconds = isOngoing
                      ? null
                      : calculateDurationSeconds(
                          item.horario_entrada,
                          item.horario_saida,
                        );

                    return (
                      <tr key={item.id}>
                        <td>{formatUtcToLocalDate(item.horario_entrada)}</td>
                        <td>
                          <div className="historico-project-cell">
                            <span>{item.projeto_nome}</span>
                            {!item.projeto_ativo ? (
                              <Badge variant="warning">Inativo</Badge>
                            ) : null}
                          </div>
                        </td>
                        <td>{formatUtcToLocalDateTime(item.horario_entrada)}</td>
                        <td>
                          {isOngoing ? (
                            <Badge variant="success">Em andamento</Badge>
                          ) : (
                            formatUtcToLocalDateTime(item.horario_saida as string)
                          )}
                        </td>
                        <td className="historico-duration-cell">
                          {durationSeconds !== null
                            ? formatDurationHMS(durationSeconds)
                            : '—'}
                        </td>
                        <td>
                          <ObservacoesCell
                            observacoes={item.observacoes}
                            atualizadoEm={item.atualizado_em}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="historico-cards-mobile" aria-label="Lista de registros em cards">
            {paginatedItems.map((item) => {
              const isOngoing = item.horario_saida === null;
              const durationSeconds = isOngoing
                ? null
                : calculateDurationSeconds(item.horario_entrada, item.horario_saida);

              return (
                <article key={item.id} className="card historico-mobile-card">
                  <div className="historico-mobile-header">
                    <strong>{formatUtcToLocalDate(item.horario_entrada)}</strong>
                    {isOngoing ? (
                      <Badge variant="success">Em andamento</Badge>
                    ) : (
                      <span className="historico-duration-cell">
                        {formatDurationHMS(durationSeconds ?? 0)}
                      </span>
                    )}
                  </div>

                  <div className="historico-project-cell">
                    <span>{item.projeto_nome}</span>
                    {!item.projeto_ativo ? (
                      <Badge variant="warning">Inativo</Badge>
                    ) : null}
                  </div>

                  <div className="historico-mobile-times">
                    <div>
                      <span className="historico-muted">Entrada: </span>
                      <span>{formatUtcToLocalDateTime(item.horario_entrada)}</span>
                    </div>
                    <div>
                      <span className="historico-muted">Saída: </span>
                      <span>
                        {isOngoing
                          ? 'Em andamento'
                          : formatUtcToLocalDateTime(item.horario_saida as string)}
                      </span>
                    </div>
                  </div>

                  <ObservacoesCell
                    observacoes={item.observacoes}
                    atualizadoEm={item.atualizado_em}
                  />
                </article>
              );
            })}
          </div>

          {totalPages > 1 ? (
            <div className="historico-pagination" aria-label="Paginação">
              <Button
                type="button"
                variant="secondary"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              >
                Anterior
              </Button>
              <span>
                Página {currentPage} de {totalPages}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
              >
                Próxima
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
