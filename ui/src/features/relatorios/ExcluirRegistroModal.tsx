import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/ToastContext';
import {
  formatDurationHMS,
  formatUtcToLocalDateTime,
} from '../../lib/dateTime';
import {
  excluirPontoAdmin,
  type RegistroPontoRelatorio,
} from './relatoriosService';

export interface ExcluirRegistroModalProps {
  isOpen: boolean;
  registro: RegistroPontoRelatorio | null;
  supabaseClient: SupabaseClient;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
}

export function ExcluirRegistroModal({
  isOpen,
  registro,
  supabaseClient,
  onClose,
  onDeleted,
}: ExcluirRegistroModalProps) {
  const { showToast } = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSubmitError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, registro]);

  if (!registro) {
    return null;
  }

  const handleConfirm = async () => {
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await excluirPontoAdmin(supabaseClient, registro.id);
      showToast({
        type: 'success',
        message: 'Registro de ponto excluído com sucesso.',
      });
      await onDeleted();
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Não foi possível excluir o registro de ponto.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Excluir Registro de Ponto"
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
            variant="danger"
            isLoading={isSubmitting}
            onClick={handleConfirm}
          >
            Confirmar exclusão
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <p className="field-hint">
          Este registro será removido dos relatórios padrão e dos cálculos de
          horas, mantendo a trilha de auditoria da exclusão.
        </p>

        <dl className="relatorios-delete-summary">
          <div>
            <dt>Usuário</dt>
            <dd>{registro.usuario_nome}</dd>
          </div>
          <div>
            <dt>Projeto</dt>
            <dd>{registro.projeto_nome}</dd>
          </div>
          <div>
            <dt>Entrada</dt>
            <dd>{formatUtcToLocalDateTime(registro.horario_entrada)}</dd>
          </div>
          <div>
            <dt>Saída</dt>
            <dd>
              {registro.horario_saida
                ? formatUtcToLocalDateTime(registro.horario_saida)
                : 'Em andamento'}
            </dd>
          </div>
          <div>
            <dt>Duração</dt>
            <dd>{formatDurationHMS(registro.duracao_segundos)}</dd>
          </div>
        </dl>

        {submitError ? (
          <div className="alert-error" role="alert">
            {submitError}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
