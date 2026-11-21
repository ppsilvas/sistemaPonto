import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Clock, FolderKanban, Play, Square } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { LoadingState } from '../../components/FeedbackStates';
import { useToast } from '../../components/ToastContext';
import {
  calculateDurationSeconds,
  formatDurationHMS,
  formatUtcToLocalTime,
} from '../../lib/dateTime';
import { getSupabaseClient } from '../../lib/supabase';
import type { Projeto } from '../../types/domain';
import { useAuth } from '../auth/AuthContext';
import {
  PontoError,
  fetchActiveSession,
  fetchLinkedActiveProjects,
  iniciarPonto,
  type SessaoPontoAtiva,
} from './pontoService';

const MAX_OBSERVACOES_LENGTH = 1000;

export interface PontoPageProps {
  supabaseClient?: SupabaseClient;
}

export function PontoPage({ supabaseClient }: PontoPageProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const getClient = useCallback(
    () => supabaseClient ?? getSupabaseClient(),
    [supabaseClient],
  );

  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [activeSession, setActiveSession] = useState<SessaoPontoAtiva | null>(
    null,
  );
  const [selectedProjetoId, setSelectedProjetoId] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [projetoError, setProjetoError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadPontoState = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const client = getClient();
      const [linkedProjects, session] = await Promise.all([
        fetchLinkedActiveProjects(client, user.id),
        fetchActiveSession(client, user.id),
      ]);

      setProjetos(linkedProjects);
      setActiveSession(session);

      if (session) {
        setSelectedProjetoId(session.projeto_id);
        setObservacoes(session.observacoes ?? '');
      } else if (linkedProjects.length === 1 && linkedProjects[0]) {
        setSelectedProjetoId(linkedProjects[0].id);
      } else {
        setSelectedProjetoId((prev) =>
          linkedProjects.some((p) => p.id === prev) ? prev : '',
        );
      }
    } catch (error) {
      showToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar o controle de ponto.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getClient, showToast, user]);

  useEffect(() => {
    void loadPontoState();
  }, [loadPontoState]);

  useEffect(() => {
    if (!activeSession) {
      return undefined;
    }

    const updateTick = () => setNowMs(Date.now());
    updateTick();

    const intervalId = window.setInterval(updateTick, 1000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        updateTick();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activeSession]);

  const elapsedFormatted = useMemo(() => {
    if (!activeSession) {
      return '00:00:00';
    }
    const seconds = calculateDurationSeconds(
      activeSession.horario_entrada,
      null,
      nowMs + clockOffsetMs,
    );
    return formatDurationHMS(seconds);
  }, [activeSession, clockOffsetMs, nowMs]);

  const handleStart = async () => {
    if (!user || activeSession || isSubmitting) {
      return;
    }

    if (!selectedProjetoId) {
      setProjetoError('Selecione um projeto para iniciar.');
      return;
    }

    setProjetoError(undefined);
    setIsSubmitting(true);

    try {
      const client = getClient();
      const created = await iniciarPonto(client, selectedProjetoId, observacoes);
      const projetoNome =
        projetos.find((p) => p.id === created.projeto_id)?.nome ?? 'Projeto';

      setClockOffsetMs(Date.parse(created.horario_entrada) - Date.now());
      setNowMs(Date.now());
      setActiveSession({
        ...created,
        projeto_nome: projetoNome,
      });
      setObservacoes(created.observacoes ?? '');
      showToast({
        type: 'success',
        message: `Ponto iniciado em ${projetoNome}.`,
      });
    } catch (error) {
      if (error instanceof PontoError && error.code === 'ACTIVE_SESSION_EXISTS') {
        showToast({ type: 'info', message: error.message });
        await loadPontoState();
      } else if (
        error instanceof PontoError &&
        error.code === 'PROJECT_NOT_LINKED'
      ) {
        showToast({ type: 'error', message: error.message });
        await loadPontoState();
      } else {
        try {
          const existing = await fetchActiveSession(getClient(), user.id);
          if (existing) {
            setActiveSession(existing);
            setSelectedProjetoId(existing.projeto_id);
            setObservacoes(existing.observacoes ?? '');
            showToast({
              type: 'info',
              message: 'Sua sessão de ponto foi iniciada e sincronizada.',
            });
            return;
          }
        } catch {
          // Mantém mensagem de erro original caso a verificação também falhe
        }

        showToast({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Não foi possível iniciar o ponto.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasLinkedProjects = projetos.length > 0;
  const isAdmin = user?.perfil === 'admin';

  return (
    <section className="ponto-container">
      <div className="page-header">
        <div>
          <h1>Registrar Ponto</h1>
          <p className="login-subtitle">
            Selecione seu projeto vinculado e acompanhe sua sessão em tempo real.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="card">
          <LoadingState message="Carregando controle de ponto..." />
        </div>
      ) : !hasLinkedProjects && !activeSession ? (
        <div className="card ponto-blocked-state" role="status">
          <FolderKanban size={36} aria-hidden="true" />
          <h2>Nenhum projeto ativo vinculado</h2>
          <p>
            Você ainda não está vinculado a nenhum projeto ativo. Solicite a um
            administrador para realizar o vínculo antes de registrar ponto.
          </p>
          {isAdmin ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/projetos')}
            >
              Ir para Projetos
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="ponto-stack">
          {activeSession ? (
            <div
              className="card ponto-active-card"
              aria-live="polite"
              data-testid="active-session-panel"
            >
              <div className="ponto-active-header">
                <Badge variant="success">Em andamento</Badge>
                <span className="ponto-start-time">
                  Início: {formatUtcToLocalTime(activeSession.horario_entrada)}
                </span>
              </div>

              <div className="ponto-active-project">
                <Clock size={20} aria-hidden="true" />
                <strong>{activeSession.projeto_nome}</strong>
              </div>

              <div
                className="ponto-timer"
                aria-label="Tempo decorrido"
                data-testid="ponto-timer"
              >
                {elapsedFormatted}
              </div>
            </div>
          ) : null}

          <div className="card form-stack">
            <div className="field-group">
              <label className="field-label" htmlFor="ponto-projeto">
                Projeto
              </label>
              <select
                id="ponto-projeto"
                className={[
                  'field-input',
                  projetoError ? 'field-input-error' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                value={selectedProjetoId}
                disabled={Boolean(activeSession) || isSubmitting}
                onChange={(event) => {
                  setSelectedProjetoId(event.target.value);
                  if (projetoError) setProjetoError(undefined);
                }}
              >
                <option value="">Selecione um projeto...</option>
                {projetos.map((projeto) => (
                  <option key={projeto.id} value={projeto.id}>
                    {projeto.nome}
                  </option>
                ))}
              </select>
              {projetoError ? (
                <span className="field-error" role="alert">
                  {projetoError}
                </span>
              ) : null}
              {activeSession ? (
                <span className="ponto-helper-text">
                  Para trocar de projeto, pause o registro atual primeiro.
                </span>
              ) : null}
            </div>

            <div className="field-group">
              <div className="ponto-obs-header">
                <label className="field-label" htmlFor="ponto-observacoes">
                  Observações (opcional)
                </label>
                <span className="ponto-char-count">
                  {observacoes.length}/{MAX_OBSERVACOES_LENGTH}
                </span>
              </div>
              <textarea
                id="ponto-observacoes"
                className="field-input ponto-textarea"
                rows={3}
                maxLength={MAX_OBSERVACOES_LENGTH}
                placeholder="Descreva brevemente a atividade executada..."
                value={observacoes}
                disabled={isSubmitting}
                onChange={(event) => setObservacoes(event.target.value)}
              />
            </div>

            <div className="ponto-actions">
              <Button
                type="button"
                size="lg"
                variant="primary"
                className="ponto-action-btn"
                disabled={
                  Boolean(activeSession) || !hasLinkedProjects || isSubmitting
                }
                onClick={handleStart}
              >
                <Play size={20} aria-hidden="true" />
                <span>{isSubmitting ? 'Iniciando...' : 'Start'}</span>
              </Button>

              <Button
                type="button"
                size="lg"
                variant="danger"
                className="ponto-action-btn"
                disabled={!activeSession || isSubmitting}
              >
                <Square size={20} aria-hidden="true" />
                <span>Pause</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
