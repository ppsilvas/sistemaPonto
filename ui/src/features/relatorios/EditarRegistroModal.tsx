import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/ToastContext';
import {
  calculateDurationSeconds,
  formatDurationHMS,
  formatUtcToLocalDateTimeInput,
  localDateTimeInputToUtcIso,
} from '../../lib/dateTime';
import {
  editarPontoAdmin,
  listUsuarioProjetosIds,
  type RegistroPontoRelatorio,
  type RelatorioProjetoOption,
} from './relatoriosService';

export interface EditarRegistroModalProps {
  isOpen: boolean;
  registro: RegistroPontoRelatorio | null;
  projetos: RelatorioProjetoOption[];
  supabaseClient: SupabaseClient;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

interface InitialFormState {
  projetoId: string;
  horarioEntrada: string;
  horarioSaida: string;
  observacoes: string;
}

export function EditarRegistroModal({
  isOpen,
  registro,
  projetos,
  supabaseClient,
  onClose,
  onSaved,
}: EditarRegistroModalProps) {
  const { showToast } = useToast();
  const [projetoId, setProjetoId] = useState('');
  const [horarioEntrada, setHorarioEntrada] = useState('');
  const [horarioSaida, setHorarioSaida] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [initialValues, setInitialValues] = useState<InitialFormState | null>(
    null,
  );
  const [linkedProjetoIds, setLinkedProjetoIds] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !registro) {
      return;
    }

    const entradaLocal = formatUtcToLocalDateTimeInput(registro.horario_entrada);
    const saidaLocal = registro.horario_saida
      ? formatUtcToLocalDateTimeInput(registro.horario_saida)
      : '';
    const obs = registro.observacoes ?? '';

    setProjetoId(registro.projeto_id);
    setHorarioEntrada(entradaLocal);
    setHorarioSaida(saidaLocal);
    setObservacoes(obs);
    setInitialValues({
      projetoId: registro.projeto_id,
      horarioEntrada: entradaLocal,
      horarioSaida: saidaLocal,
      observacoes: obs,
    });
    setSubmitError(null);
    setIsSubmitting(false);

    let active = true;
    const loadLinkedProjects = async () => {
      try {
        const ids = await listUsuarioProjetosIds(
          supabaseClient,
          registro.usuario_id,
        );
        if (active) {
          setLinkedProjetoIds(ids);
        }
      } catch {
        if (active) {
          setLinkedProjetoIds([]);
        }
      }
    };

    void loadLinkedProjects();
    return () => {
      active = false;
    };
  }, [isOpen, registro, supabaseClient]);

  const { entradaIso, saidaIso, validationError, previewDuration } =
    useMemo(() => {
      if (!horarioEntrada) {
        return {
          entradaIso: null as string | null,
          saidaIso: null as string | null,
          validationError: null as string | null,
          previewDuration: '—',
        };
      }

      let parsedEntradaIso: string;
      try {
        parsedEntradaIso = localDateTimeInputToUtcIso(horarioEntrada);
      } catch {
        return {
          entradaIso: null,
          saidaIso: null,
          validationError: 'Horário de entrada inválido.',
          previewDuration: '—',
        };
      }

      if (!horarioSaida) {
        return {
          entradaIso: parsedEntradaIso,
          saidaIso: null,
          validationError: null,
          previewDuration: 'Em andamento',
        };
      }

      let parsedSaidaIso: string;
      try {
        parsedSaidaIso = localDateTimeInputToUtcIso(horarioSaida);
      } catch {
        return {
          entradaIso: parsedEntradaIso,
          saidaIso: null,
          validationError: 'Horário de saída inválido.',
          previewDuration: '—',
        };
      }

      if (new Date(parsedSaidaIso).getTime() < new Date(parsedEntradaIso).getTime()) {
        return {
          entradaIso: parsedEntradaIso,
          saidaIso: parsedSaidaIso,
          validationError:
            'O horário de saída não pode ser anterior ao horário de entrada.',
          previewDuration: '—',
        };
      }

      const seconds = calculateDurationSeconds(parsedEntradaIso, parsedSaidaIso);
      return {
        entradaIso: parsedEntradaIso,
        saidaIso: parsedSaidaIso,
        validationError: null,
        previewDuration: formatDurationHMS(seconds),
      };
    }, [horarioEntrada, horarioSaida]);

  const hasChanges = useMemo(() => {
    if (!initialValues) return false;
    return (
      projetoId !== initialValues.projetoId ||
      horarioEntrada !== initialValues.horarioEntrada ||
      horarioSaida !== initialValues.horarioSaida ||
      observacoes.trim() !== initialValues.observacoes.trim()
    );
  }, [horarioEntrada, horarioSaida, initialValues, observacoes, projetoId]);

  const orderedProjetos = useMemo(() => {
    const linkedSet = new Set(linkedProjetoIds);
    return [...projetos].sort((a, b) => {
      const aLinked = linkedSet.has(a.id) ? 0 : 1;
      const bLinked = linkedSet.has(b.id) ? 0 : 1;
      if (aLinked !== bLinked) return aLinked - bLinked;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [linkedProjetoIds, projetos]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!registro || !entradaIso || validationError || !hasChanges) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await editarPontoAdmin(supabaseClient, {
        registroId: registro.id,
        projetoId,
        horarioEntrada: entradaIso,
        horarioSaida: saidaIso,
        observacoes,
      });

      showToast({
        type: 'success',
        message: 'Registro de ponto atualizado com sucesso.',
      });
      await onSaved();
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar as alterações do registro de ponto.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!registro) {
    return null;
  }

  const linkedSet = new Set(linkedProjetoIds);
  const formId = 'editar-registro-form';

  return (
    <Modal
      isOpen={isOpen}
      title="Editar Registro de Ponto"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form={formId}
            isLoading={isSubmitting}
            disabled={!hasChanges || Boolean(validationError) || !horarioEntrada}
          >
            Salvar alterações
          </Button>
        </>
      }
    >
      <form id={formId} className="form-stack" onSubmit={handleSubmit}>
        <div className="field-group">
          <span className="field-label">Usuário</span>
          <p className="field-readonly" data-testid="editar-usuario-nome">
            <strong>{registro.usuario_nome}</strong>
          </p>
        </div>

        <div className="field-group">
          <label htmlFor="editar-registro-projeto" className="field-label">
            Projeto
          </label>
          <select
            id="editar-registro-projeto"
            className="field-input"
            value={projetoId}
            onChange={(event) => setProjetoId(event.target.value)}
            required
          >
            {orderedProjetos.map((projeto) => {
              const tags: string[] = [];
              if (linkedSet.has(projeto.id)) tags.push('Vinculado');
              if (!projeto.ativo) tags.push('Inativo');
              const suffix = tags.length > 0 ? ` (${tags.join(', ')})` : '';
              return (
                <option key={projeto.id} value={projeto.id}>
                  {projeto.nome}
                  {suffix}
                </option>
              );
            })}
          </select>
        </div>

        <Input
          id="editar-registro-entrada"
          label="Horário de entrada"
          type="datetime-local"
          value={horarioEntrada}
          onChange={(event) => setHorarioEntrada(event.target.value)}
          required
        />

        <Input
          id="editar-registro-saida"
          label="Horário de saída"
          type="datetime-local"
          value={horarioSaida}
          onChange={(event) => setHorarioSaida(event.target.value)}
          error={validationError ?? undefined}
        />
        <span className="field-hint">
          Opcional apenas se o ponto estiver em aberto.
        </span>

        <div className="field-group">
          <span className="field-label">Duração calculada (prévia)</span>
          <strong data-testid="editar-duracao-previa">{previewDuration}</strong>
        </div>

        <div className="field-group">
          <label htmlFor="editar-registro-observacoes" className="field-label">
            Observações
          </label>
          <textarea
            id="editar-registro-observacoes"
            className="field-input"
            rows={3}
            value={observacoes}
            onChange={(event) => setObservacoes(event.target.value)}
            placeholder="Observações sobre o registro (opcional)"
          />
        </div>

        {submitError ? (
          <div className="alert-error" role="alert">
            {submitError}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
