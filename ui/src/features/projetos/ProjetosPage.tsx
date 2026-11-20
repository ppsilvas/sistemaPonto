import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Plus } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState, LoadingState } from '../../components/FeedbackStates';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/ToastContext';
import { formatUtcToLocalDateTime } from '../../lib/dateTime';
import { getSupabaseClient } from '../../lib/supabase';
import {
  createProjeto,
  excluirProjeto,
  inativarProjeto,
  listProjetos,
  reativarProjeto,
  updateProjeto,
  type ProjetoComContagem,
} from './projetosService';

type StatusFilter = 'todos' | 'ativos' | 'inativos';

export interface ProjetosPageProps {
  supabaseClient?: SupabaseClient;
}

function summarizeDescription(text: string | null): string {
  if (!text) return '—';
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

export function ProjetosPage({ supabaseClient }: ProjetosPageProps) {
  const { showToast } = useToast();
  const getClient = useCallback(
    () => supabaseClient ?? getSupabaseClient(),
    [supabaseClient],
  );

  const [projetos, setProjetos] = useState<ProjetoComContagem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProjeto, setEditingProjeto] =
    useState<ProjetoComContagem | null>(null);
  const [nomeInput, setNomeInput] = useState('');
  const [descricaoInput, setDescricaoInput] = useState('');
  const [nomeError, setNomeError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProjetoComContagem | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const loadProjetos = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listProjetos(getClient());
      setProjetos(data);
    } catch (error) {
      showToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao carregar projetos.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getClient, showToast]);

  useEffect(() => {
    void loadProjetos();
  }, [loadProjetos]);

  const filteredProjetos = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return projetos.filter((projeto) => {
      if (statusFilter === 'ativos' && !projeto.ativo) return false;
      if (statusFilter === 'inativos' && projeto.ativo) return false;
      if (!query) return true;
      return (
        projeto.nome.toLowerCase().includes(query) ||
        (projeto.descricao ?? '').toLowerCase().includes(query)
      );
    });
  }, [projetos, searchTerm, statusFilter]);

  const openCreateModal = () => {
    setEditingProjeto(null);
    setNomeInput('');
    setDescricaoInput('');
    setNomeError(undefined);
    setIsFormOpen(true);
  };

  const openEditModal = (projeto: ProjetoComContagem) => {
    setEditingProjeto(projeto);
    setNomeInput(projeto.nome);
    setDescricaoInput(projeto.descricao ?? '');
    setNomeError(undefined);
    setIsFormOpen(true);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = nomeInput.trim();
    if (!trimmed) {
      setNomeError('O nome do projeto é obrigatório.');
      return;
    }

    setNomeError(undefined);
    setIsSaving(true);
    try {
      const client = getClient();
      if (editingProjeto) {
        await updateProjeto(client, editingProjeto.id, {
          nome: trimmed,
          descricao: descricaoInput,
        });
        showToast({ type: 'success', message: 'Projeto atualizado com sucesso.' });
      } else {
        await createProjeto(client, {
          nome: trimmed,
          descricao: descricaoInput,
        });
        showToast({ type: 'success', message: 'Projeto cadastrado com sucesso.' });
      }
      setIsFormOpen(false);
      await loadProjetos();
    } catch (error) {
      showToast({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao salvar projeto.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (projeto: ProjetoComContagem) => {
    try {
      const client = getClient();
      if (projeto.ativo) {
        await inativarProjeto(client, projeto.id);
        showToast({ type: 'success', message: 'Projeto inativado.' });
      } else {
        await reativarProjeto(client, projeto.id);
        showToast({ type: 'success', message: 'Projeto reativado.' });
      }
      await loadProjetos();
    } catch (error) {
      showToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao alterar status do projeto.',
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await excluirProjeto(getClient(), deleteTarget.id);
      showToast({ type: 'success', message: 'Projeto excluído com sucesso.' });
      setDeleteTarget(null);
      await loadProjetos();
    } catch (error) {
      showToast({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Erro ao excluir projeto.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="card">
      <div className="page-header">
        <div>
          <h1>Projetos</h1>
          <p className="login-subtitle">
            Cadastre, edite e gerencie o status dos projetos de trabalho.
          </p>
        </div>
        <Button variant="primary" onClick={openCreateModal}>
          <Plus size={18} aria-hidden="true" />
          <span>Novo Projeto</span>
        </Button>
      </div>

      <div className="filters-bar">
        <Input
          label="Buscar"
          placeholder="Buscar por nome ou descrição"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <div className="field-group">
          <label htmlFor="projeto-status-filter" className="field-label">
            Status
          </label>
          <select
            id="projeto-status-filter"
            className="field-input"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
          >
            <option value="todos">Todos</option>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Carregando projetos..." />
      ) : filteredProjetos.length === 0 ? (
        <EmptyState
          title="Nenhum projeto encontrado"
          description={
            projetos.length === 0
              ? 'Cadastre o primeiro projeto para liberar os registros de ponto.'
              : 'Nenhum projeto corresponde aos filtros aplicados.'
          }
          action={
            projetos.length === 0 ? (
              <Button variant="primary" onClick={openCreateModal}>
                Criar primeiro projeto
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('todos');
                }}
              >
                Limpar filtros
              </Button>
            )
          }
        />
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th>Status</th>
                <th>Vinculados</th>
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjetos.map((projeto) => (
                <tr key={projeto.id}>
                  <td>
                    <strong>{projeto.nome}</strong>
                  </td>
                  <td>{summarizeDescription(projeto.descricao)}</td>
                  <td>
                    <Badge variant={projeto.ativo ? 'success' : 'warning'}>
                      {projeto.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td>{projeto.usuarios_vinculados_count}</td>
                  <td>{formatUtcToLocalDateTime(projeto.criado_em)}</td>
                  <td>
                    <div className="actions-row">
                      <Button
                        variant="secondary"
                        onClick={() => openEditModal(projeto)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void handleToggleStatus(projeto)}
                      >
                        {projeto.ativo ? 'Inativar' : 'Reativar'}
                      </Button>
                      {projeto.registros_count === 0 ? (
                        <Button
                          variant="danger"
                          onClick={() => setDeleteTarget(projeto)}
                        >
                          Excluir
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isFormOpen}
        title={editingProjeto ? 'Editar Projeto' : 'Novo Projeto'}
        onClose={() => setIsFormOpen(false)}
      >
        <form className="form-stack" onSubmit={handleSave} noValidate>
          <Input
            label="Nome do projeto"
            name="nome"
            value={nomeInput}
            onChange={(event) => setNomeInput(event.target.value)}
            error={nomeError}
            placeholder="Ex.: Cliente Alpha - Redesign"
            disabled={isSaving}
          />
          <div className="field-group">
            <label htmlFor="projeto-descricao" className="field-label">
              Descrição
            </label>
            <textarea
              id="projeto-descricao"
              className="field-input"
              rows={3}
              value={descricaoInput}
              onChange={(event) => setDescricaoInput(event.target.value)}
              placeholder="Escopo ou detalhes gerais (opcional)"
              disabled={isSaving}
            />
          </div>
          <div className="modal-footer">
            <Button
              variant="secondary"
              onClick={() => setIsFormOpen(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        title="Confirmar exclusão"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              isLoading={isDeleting}
              onClick={() => void handleConfirmDelete()}
            >
              Confirmar exclusão
            </Button>
          </>
        }
      >
        <p>
          Deseja excluir permanentemente o projeto{' '}
          <strong>{deleteTarget?.nome}</strong>? Os vínculos de usuários serão
          removidos.
        </p>
      </Modal>
    </section>
  );
}
