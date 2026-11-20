import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { LoadingState } from '../../components/FeedbackStates';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/ToastContext';
import type { ProjetoComContagem } from './projetosService';
import {
  desvincularUsuarioDoProjeto,
  listUsuariosAtivosElegiveis,
  listVinculosProjeto,
  vincularUsuariosAoProjeto,
  type UsuarioElegivel,
  type UsuarioVinculado,
} from './usuarioProjetosService';

export interface GerenciarEquipeModalProps {
  isOpen: boolean;
  projeto: ProjetoComContagem | null;
  supabaseClient: SupabaseClient;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

export function GerenciarEquipeModal({
  isOpen,
  projeto,
  supabaseClient,
  onClose,
  onChanged,
}: GerenciarEquipeModalProps) {
  const { showToast } = useToast();

  const [vinculados, setVinculados] = useState<UsuarioVinculado[]>([]);
  const [elegiveis, setElegiveis] = useState<UsuarioElegivel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLinking, setIsLinking] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const loadModalData = useCallback(async () => {
    if (!projeto) return;
    setIsLoading(true);
    try {
      const [links, activeUsers] = await Promise.all([
        listVinculosProjeto(supabaseClient, projeto.id),
        listUsuariosAtivosElegiveis(supabaseClient),
      ]);
      setVinculados(links);
      setElegiveis(activeUsers);
      setSelectedIds([]);
    } catch (error) {
      showToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao carregar equipe do projeto.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [projeto, showToast, supabaseClient]);

  useEffect(() => {
    if (isOpen && projeto) {
      setSearchTerm('');
      void loadModalData();
    }
  }, [isOpen, projeto, loadModalData]);

  const disponiveis = useMemo(() => {
    const linkedIds = new Set(vinculados.map((u) => u.id));
    const query = searchTerm.trim().toLowerCase();
    return elegiveis.filter((u) => {
      if (linkedIds.has(u.id)) return false;
      if (!query) return true;
      return (
        u.nome.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query)
      );
    });
  }, [elegiveis, vinculados, searchTerm]);

  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const handleVincular = async () => {
    if (!projeto || selectedIds.length === 0) return;
    setIsLinking(true);
    try {
      await vincularUsuariosAoProjeto(supabaseClient, projeto.id, selectedIds);
      showToast({
        type: 'success',
        message: 'Usuário(s) vinculado(s) ao projeto.',
      });
      await loadModalData();
      await onChanged();
    } catch (error) {
      showToast({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao vincular usuários.',
      });
    } finally {
      setIsLinking(false);
    }
  };

  const handleDesvincular = async (usuario: UsuarioVinculado) => {
    if (!projeto) return;
    setRemovingUserId(usuario.id);
    try {
      await desvincularUsuarioDoProjeto(supabaseClient, usuario.id, projeto.id);
      showToast({
        type: 'success',
        message: `${usuario.nome} desvinculado(a) do projeto.`,
      });
      await loadModalData();
      await onChanged();
    } catch (error) {
      showToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao desvincular usuário.',
      });
    } finally {
      setRemovingUserId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title={projeto ? `Gerenciar Equipe — ${projeto.nome}` : 'Gerenciar Equipe'}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {isLoading ? (
        <LoadingState message="Carregando equipe do projeto..." />
      ) : (
        <div className="form-stack">
          <div className="modal-section">
            <h3 className="field-label">
              Usuários vinculados ({vinculados.length})
            </h3>
            {vinculados.length === 0 ? (
              <p className="login-subtitle">
                Nenhum usuário vinculado a este projeto.
              </p>
            ) : (
              <ul className="team-list">
                {vinculados.map((usuario) => (
                  <li key={usuario.id} className="team-item">
                    <div className="team-item-info">
                      <strong>{usuario.nome}</strong>
                      <small className="login-subtitle">{usuario.email}</small>
                      <div className="actions-row">
                        <Badge variant={usuario.perfil}>
                          {usuario.perfil === 'admin' ? 'Admin' : 'Worker'}
                        </Badge>
                        <Badge variant={usuario.ativo ? 'success' : 'warning'}>
                          {usuario.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      isLoading={removingUserId === usuario.id}
                      disabled={removingUserId !== null || isLinking}
                      onClick={() => void handleDesvincular(usuario)}
                    >
                      Desvincular
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="modal-section">
            <h3 className="field-label">Vincular usuários ativos</h3>
            {!projeto?.ativo ? (
              <div className="alert-error" role="status">
                Este projeto está inativo. Reative o projeto antes de vincular
                novos usuários.
              </div>
            ) : (
              <div className="form-stack">
                <Input
                  label="Buscar usuário disponível"
                  placeholder="Filtrar por nome ou e-mail"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
                {disponiveis.length === 0 ? (
                  <p className="login-subtitle">
                    Nenhum usuário ativo disponível para vínculo.
                  </p>
                ) : (
                  <div className="checkbox-list">
                    {disponiveis.map((usuario) => (
                      <label key={usuario.id} className="checkbox-item">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(usuario.id)}
                          onChange={() => toggleSelect(usuario.id)}
                          disabled={isLinking}
                        />
                        <span>
                          {usuario.nome} ({usuario.email}) —{' '}
                          {usuario.perfil === 'admin' ? 'Admin' : 'Worker'}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <Button
                  variant="primary"
                  disabled={selectedIds.length === 0 || removingUserId !== null}
                  isLoading={isLinking}
                  onClick={() => void handleVincular()}
                >
                  Vincular selecionados
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
