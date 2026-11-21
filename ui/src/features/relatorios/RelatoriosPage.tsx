import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState, LoadingState } from '../../components/FeedbackStates';
import { Input } from '../../components/Input';
import { useToast } from '../../components/ToastContext';
import {
  formatDurationHMS,
  formatTotalHours,
  formatUtcToLocalDateTime,
  getPeriodRange,
  type PeriodPreset,
} from '../../lib/dateTime';
import { getSupabaseClient } from '../../lib/supabase';
import {
  fetchRelatorioPontos,
  listRelatorioFilterOptions,
  type RegistroPontoRelatorio,
  type RelatorioFilterOptions,
  type RelatorioFiltros,
  type RelatorioResultado,
  type RelatorioStatusFilter,
} from './relatoriosService';

export interface RelatoriosPageProps {
  supabaseClient?: SupabaseClient;
  onEditRegistro?: (registro: RegistroPontoRelatorio) => void;
  onDeleteRegistro?: (registro: RegistroPontoRelatorio) => void;
  onExportCsv?: (
    filtros: RelatorioFiltros,
    resultado: RelatorioResultado,
  ) => void;
  initialNowMs?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

const PERIOD_PRESETS: Array<{ key: PeriodPreset; label: string }> = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'esta_semana', label: 'Esta semana' },
  { key: 'este_mes', label: 'Este mês' },
  { key: 'mes_anterior', label: 'Mês anterior' },
];

function createDefaultFiltros(): RelatorioFiltros {
  const { startDate, endDate } = getPeriodRange('este_mes');
  return {
    usuarioId: 'todos',
    projetoId: 'todos',
    dataInicial: startDate,
    dataFinal: endDate,
    status: 'todos',
    incluirExcluidos: false,
  };
}

const EMPTY_RESULTADO: RelatorioResultado = {
  registros: [],
  resumo: {
    total_segundos: 0,
    total_registros: 0,
    sessoes_em_andamento: 0,
    horas_por_projeto: [],
    horas_por_usuario: [],
  },
};

export function RelatoriosPage({
  supabaseClient,
  onEditRegistro,
  onDeleteRegistro,
  onExportCsv,
  initialNowMs,
  pageSize = DEFAULT_PAGE_SIZE,
}: RelatoriosPageProps) {
  const { showToast } = useToast();
  const getClient = useCallback(
    () => supabaseClient ?? getSupabaseClient(),
    [supabaseClient],
  );

  const [filterOptions, setFilterOptions] = useState<RelatorioFilterOptions>({
    usuarios: [],
    projetos: [],
  });
  const [filtros, setFiltros] = useState<RelatorioFiltros>(createDefaultFiltros);
  const [dateError, setDateError] = useState<string | null>(null);
  const [resultado, setResultado] =
    useState<RelatorioResultado>(EMPTY_RESULTADO);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [showGroupedSummary, setShowGroupedSummary] = useState(false);

  const usuariosNomeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of filterOptions.usuarios) {
      map.set(u.id, u.nome);
    }
    return map;
  }, [filterOptions.usuarios]);

  useEffect(() => {
    let active = true;
    const loadOptions = async () => {
      try {
        const options = await listRelatorioFilterOptions(getClient());
        if (active) {
          setFilterOptions(options);
        }
      } catch (error) {
        if (active) {
          showToast({
            type: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Erro ao carregar opções de filtro.',
          });
        }
      }
    };
    void loadOptions();
    return () => {
      active = false;
    };
  }, [getClient, showToast]);

  useEffect(() => {
    if (!filtros.dataInicial || !filtros.dataFinal) {
      setDateError(null);
      setIsLoading(false);
      return;
    }

    if (filtros.dataInicial > filtros.dataFinal) {
      setDateError('A data inicial não pode ser maior que a data final.');
      setIsLoading(false);
      return;
    }

    setDateError(null);
    let active = true;

    const loadRelatorio = async () => {
      setIsLoading(true);
      try {
        const data = await fetchRelatorioPontos(getClient(), filtros, {
          usuariosNomeMap,
          nowMs: initialNowMs,
        });
        if (active) {
          setResultado(data);
          setCurrentPage(1);
        }
      } catch (error) {
        if (active) {
          showToast({
            type: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Erro ao carregar relatório de pontos.',
          });
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadRelatorio();
    return () => {
      active = false;
    };
  }, [filtros, getClient, initialNowMs, showToast, usuariosNomeMap]);

  const totalPages = Math.max(
    1,
    Math.ceil(resultado.registros.length / Math.max(1, pageSize)),
  );
  const paginatedRegistros = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return resultado.registros.slice(start, start + pageSize);
  }, [currentPage, pageSize, resultado.registros]);

  const handleApplyPreset = (preset: PeriodPreset) => {
    const { startDate, endDate } = getPeriodRange(preset);
    setFiltros((prev) => ({
      ...prev,
      dataInicial: startDate,
      dataFinal: endDate,
    }));
  };

  const handleClearFilters = () => {
    setFiltros(createDefaultFiltros());
  };

  const handleExport = () => {
    if (onExportCsv) {
      onExportCsv(filtros, resultado);
      return;
    }
    showToast({
      type: 'info',
      message: 'Exportação CSV será disponibilizada em breve (UC-12).',
    });
  };

  const handleEdit = (registro: RegistroPontoRelatorio) => {
    if (onEditRegistro) {
      onEditRegistro(registro);
      return;
    }
    showToast({
      type: 'info',
      message: 'Edição de registro será disponibilizada em breve (UC-11).',
    });
  };

  const handleDelete = (registro: RegistroPontoRelatorio) => {
    if (onDeleteRegistro) {
      onDeleteRegistro(registro);
      return;
    }
    showToast({
      type: 'info',
      message: 'Exclusão de registro será disponibilizada em breve (UC-11).',
    });
  };

  const renderAuditoria = (registro: RegistroPontoRelatorio) => {
    if (!registro.atualizado_em && !registro.excluido_em) {
      return <span className="field-hint">—</span>;
    }

    return (
      <div className="relatorios-audit-list">
        {registro.atualizado_em ? (
          <Badge variant="worker">
            Editado por {registro.atualizado_por_nome ?? 'Administrador'} em{' '}
            {formatUtcToLocalDateTime(registro.atualizado_em)}
          </Badge>
        ) : null}
        {registro.excluido_em ? (
          <Badge variant="warning">
            Excluído por {registro.excluido_por_nome ?? 'Administrador'} em{' '}
            {formatUtcToLocalDateTime(registro.excluido_em)}
          </Badge>
        ) : null}
      </div>
    );
  };

  const renderSaidaStatus = (registro: RegistroPontoRelatorio) => {
    if (!registro.em_andamento && registro.horario_saida) {
      return <span>{formatUtcToLocalDateTime(registro.horario_saida)}</span>;
    }

    return (
      <div className="relatorios-status-stack">
        <Badge variant="success">Em andamento</Badge>
        {registro.alerta_longa_duracao ? (
          <Badge variant="warning">
            <AlertTriangle size={12} aria-hidden="true" />
            <span>Aberta há mais de 12h</span>
          </Badge>
        ) : null}
      </div>
    );
  };

  return (
    <section className="card">
      <div className="page-header">
        <div>
          <h1>Relatório de Pontos</h1>
          <p className="login-subtitle">
            Consulte registros globais da equipe, indicadores e auditoria.
          </p>
        </div>
        <Button variant="secondary" onClick={handleExport}>
          <Download size={18} aria-hidden="true" />
          <span>Exportar CSV</span>
        </Button>
      </div>

      <div className="relatorios-filters-panel">
        <div className="relatorios-filters-grid">
          <div className="field-group">
            <label htmlFor="relatorio-usuario" className="field-label">
              Usuário
            </label>
            <select
              id="relatorio-usuario"
              className="field-input"
              value={filtros.usuarioId}
              onChange={(event) =>
                setFiltros((prev) => ({
                  ...prev,
                  usuarioId: event.target.value,
                }))
              }
            >
              <option value="todos">Todos</option>
              {filterOptions.usuarios.map((usuario) => (
                <option key={usuario.id} value={usuario.id}>
                  {usuario.ativo ? usuario.nome : `${usuario.nome} (Inativo)`}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label htmlFor="relatorio-projeto" className="field-label">
              Projeto
            </label>
            <select
              id="relatorio-projeto"
              className="field-input"
              value={filtros.projetoId}
              onChange={(event) =>
                setFiltros((prev) => ({
                  ...prev,
                  projetoId: event.target.value,
                }))
              }
            >
              <option value="todos">Todos</option>
              {filterOptions.projetos.map((projeto) => (
                <option key={projeto.id} value={projeto.id}>
                  {projeto.ativo ? projeto.nome : `${projeto.nome} (Inativo)`}
                </option>
              ))}
            </select>
          </div>

          <Input
            id="relatorio-data-inicial"
            label="Data inicial"
            type="date"
            value={filtros.dataInicial}
            onChange={(event) =>
              setFiltros((prev) => ({
                ...prev,
                dataInicial: event.target.value,
              }))
            }
          />

          <Input
            id="relatorio-data-final"
            label="Data final"
            type="date"
            value={filtros.dataFinal}
            onChange={(event) =>
              setFiltros((prev) => ({
                ...prev,
                dataFinal: event.target.value,
              }))
            }
          />

          <div className="field-group">
            <label htmlFor="relatorio-status" className="field-label">
              Status
            </label>
            <select
              id="relatorio-status"
              className="field-input"
              value={filtros.status}
              onChange={(event) =>
                setFiltros((prev) => ({
                  ...prev,
                  status: event.target.value as RelatorioStatusFilter,
                }))
              }
            >
              <option value="todos">Todos</option>
              <option value="em_andamento">Em andamento</option>
              <option value="encerrados">Encerrados</option>
              <option value="editados">Editados por admin</option>
            </select>
          </div>
        </div>

        <div className="relatorios-filters-footer">
          <div className="relatorios-presets" role="group" aria-label="Atalhos de período">
            {PERIOD_PRESETS.map((preset) => (
              <Button
                key={preset.key}
                variant="secondary"
                onClick={() => handleApplyPreset(preset.key)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <label className="checkbox-item">
            <input
              type="checkbox"
              checked={filtros.incluirExcluidos}
              onChange={(event) =>
                setFiltros((prev) => ({
                  ...prev,
                  incluirExcluidos: event.target.checked,
                }))
              }
            />
            <span>Incluir excluídos (Auditoria)</span>
          </label>
        </div>

        {dateError ? (
          <div className="alert-error" role="alert">
            {dateError}
          </div>
        ) : null}
      </div>

      <div className="relatorios-kpi-grid">
        <div className="relatorios-kpi-card">
          <span className="relatorios-kpi-label">Total de horas acumuladas</span>
          <strong className="relatorios-kpi-value" data-testid="total-horas-acumuladas">
            {formatTotalHours(resultado.resumo.total_segundos)}
          </strong>
        </div>

        <div className="relatorios-kpi-card">
          <span className="relatorios-kpi-label">Total de registros</span>
          <strong className="relatorios-kpi-value" data-testid="total-registros">
            {resultado.resumo.total_registros}
          </strong>
        </div>

        <div
          className={[
            'relatorios-kpi-card',
            resultado.resumo.sessoes_em_andamento > 0
              ? 'relatorios-kpi-highlight'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span className="relatorios-kpi-label">Sessões em andamento</span>
          <strong className="relatorios-kpi-value" data-testid="sessoes-em-andamento">
            {resultado.resumo.sessoes_em_andamento}
          </strong>
        </div>
      </div>

      <div className="relatorios-grouped-wrapper">
        <Button
          variant="ghost"
          aria-expanded={showGroupedSummary}
          onClick={() => setShowGroupedSummary((prev) => !prev)}
        >
          {showGroupedSummary ? (
            <ChevronUp size={18} aria-hidden="true" />
          ) : (
            <ChevronDown size={18} aria-hidden="true" />
          )}
          <span>Resumo agrupado (Horas por Projeto e por Usuário)</span>
        </Button>

        {showGroupedSummary ? (
          <div className="relatorios-grouped-grid">
            <div className="relatorios-grouped-card">
              <h2>Horas por Projeto</h2>
              {resultado.resumo.horas_por_projeto.length === 0 ? (
                <p className="field-hint">Nenhuma sessão encerrada no filtro.</p>
              ) : (
                <ul className="relatorios-grouped-list">
                  {resultado.resumo.horas_por_projeto.map((item) => (
                    <li key={item.id} className="relatorios-grouped-item">
                      <span>
                        {item.nome}{' '}
                        {!item.ativo ? (
                          <Badge variant="warning">Inativo</Badge>
                        ) : null}
                      </span>
                      <strong>{formatTotalHours(item.total_segundos)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="relatorios-grouped-card">
              <h2>Horas por Usuário</h2>
              {resultado.resumo.horas_por_usuario.length === 0 ? (
                <p className="field-hint">Nenhuma sessão encerrada no filtro.</p>
              ) : (
                <ul className="relatorios-grouped-list">
                  {resultado.resumo.horas_por_usuario.map((item) => (
                    <li key={item.id} className="relatorios-grouped-item">
                      <span>
                        {item.nome}{' '}
                        {!item.ativo ? (
                          <Badge variant="warning">Inativo</Badge>
                        ) : null}
                      </span>
                      <strong>{formatTotalHours(item.total_segundos)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingState message="Carregando registros de ponto..." />
      ) : resultado.registros.length === 0 ? (
        <EmptyState
          title="Nenhum registro encontrado"
          description="Não há registros de ponto para os filtros selecionados."
          action={
            <Button variant="secondary" onClick={handleClearFilters}>
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <>
          <div className="table-wrapper relatorios-table-desktop" data-testid="relatorios-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Projeto</th>
                  <th>Entrada</th>
                  <th>Saída</th>
                  <th>Duração</th>
                  <th>Observações</th>
                  <th>Auditoria</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRegistros.map((registro) => (
                  <tr
                    key={registro.id}
                    className={[
                      registro.excluido ? 'relatorios-row-excluded' : '',
                      registro.alerta_longa_duracao
                        ? 'relatorios-row-warning'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td>
                      <div className="relatorios-cell-name">
                        <strong>{registro.usuario_nome}</strong>
                        {!registro.usuario_ativo ? (
                          <Badge variant="warning">Inativo</Badge>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="relatorios-cell-name">
                        <span>{registro.projeto_nome}</span>
                        {!registro.projeto_ativo ? (
                          <Badge variant="warning">Inativo</Badge>
                        ) : null}
                      </div>
                    </td>
                    <td>{formatUtcToLocalDateTime(registro.horario_entrada)}</td>
                    <td>{renderSaidaStatus(registro)}</td>
                    <td>
                      <span className="relatorios-duration">
                        {formatDurationHMS(registro.duracao_segundos)}
                      </span>
                    </td>
                    <td>{registro.observacoes ?? '—'}</td>
                    <td>{renderAuditoria(registro)}</td>
                    <td>
                      <div className="actions-row">
                        <Button
                          variant="secondary"
                          aria-label={`Editar registro de ${registro.usuario_nome}`}
                          disabled={registro.excluido}
                          onClick={() => handleEdit(registro)}
                        >
                          <Pencil size={15} aria-hidden="true" />
                          <span>Editar</span>
                        </Button>
                        <Button
                          variant="danger"
                          aria-label={`Excluir registro de ${registro.usuario_nome}`}
                          disabled={registro.excluido}
                          onClick={() => handleDelete(registro)}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                          <span>Excluir</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="relatorios-cards-mobile" data-testid="relatorios-mobile-cards">
            {paginatedRegistros.map((registro) => (
              <article
                key={registro.id}
                className={[
                  'relatorios-mobile-card',
                  registro.excluido ? 'relatorios-row-excluded' : '',
                  registro.alerta_longa_duracao
                    ? 'relatorios-row-warning'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="relatorios-mobile-card-header">
                  <strong>{registro.usuario_nome}</strong>
                  <span>{formatDurationHMS(registro.duracao_segundos)}</span>
                </div>
                <div className="relatorios-mobile-card-row">
                  <span className="field-hint">Projeto:</span>
                  <span>{registro.projeto_nome}</span>
                </div>
                <div className="relatorios-mobile-card-row">
                  <span className="field-hint">Entrada:</span>
                  <span>{formatUtcToLocalDateTime(registro.horario_entrada)}</span>
                </div>
                <div className="relatorios-mobile-card-row">
                  <span className="field-hint">Saída:</span>
                  {renderSaidaStatus(registro)}
                </div>
                {registro.observacoes ? (
                  <div className="relatorios-mobile-card-row">
                    <span className="field-hint">Observações:</span>
                    <span>{registro.observacoes}</span>
                  </div>
                ) : null}
                {renderAuditoria(registro)}
                <div className="actions-row">
                  <Button
                    variant="secondary"
                    disabled={registro.excluido}
                    onClick={() => handleEdit(registro)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="danger"
                    disabled={registro.excluido}
                    onClick={() => handleDelete(registro)}
                  >
                    Excluir
                  </Button>
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="relatorios-pagination">
              <Button
                variant="secondary"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="field-hint">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
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
