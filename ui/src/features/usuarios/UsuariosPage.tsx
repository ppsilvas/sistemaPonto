import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Copy, KeyRound, Plus } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState, LoadingState } from '../../components/FeedbackStates';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/ToastContext';
import { formatUtcToLocalDateTime } from '../../lib/dateTime';
import { getSupabaseClient } from '../../lib/supabase';
import type { PerfilNome, Projeto } from '../../types/domain';
import {
  createUsuario,
  generateStrongPassword,
  listProjetosAtivos,
  listUsuarios,
  type UsuarioListItem,
} from './usuariosService';

type PerfilFilter = 'todos' | PerfilNome;
type StatusFilter = 'todos' | 'ativos' | 'inativos';

export interface UsuariosPageProps {
  supabaseClient?: SupabaseClient;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function UsuariosPage({ supabaseClient }: UsuariosPageProps) {
  const { showToast } = useToast();
  const getClient = useCallback(
    () => supabaseClient ?? getSupabaseClient(),
    [supabaseClient],
  );

  const [usuarios, setUsuarios] = useState<UsuarioListItem[]>([]);
  const [projetosAtivos, setProjetosAtivos] = useState<Projeto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [perfilFilter, setPerfilFilter] = useState<PerfilFilter>('todos');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [perfil, setPerfil] = useState<PerfilNome>('worker');
  const [selectedProjetos, setSelectedProjetos] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<{
    nome?: string;
    email?: string;
    password?: string;
  }>({});
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const client = getClient();
      const [usersData, projectsData] = await Promise.all([
        listUsuarios(client),
        listProjetosAtivos(client),
      ]);
      setUsuarios(usersData);
      setProjetosAtivos(projectsData);
    } catch (error) {
      showToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao carregar usuários.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getClient, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredUsuarios = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return usuarios.filter((usuario) => {
      if (perfilFilter !== 'todos' && usuario.perfil !== perfilFilter) {
        return false;
      }
      if (statusFilter === 'ativos' && !usuario.ativo) return false;
      if (statusFilter === 'inativos' && usuario.ativo) return false;
      if (!query) return true;
      return (
        usuario.nome.toLowerCase().includes(query) ||
        usuario.email.toLowerCase().includes(query)
      );
    });
  }, [usuarios, searchTerm, perfilFilter, statusFilter]);

  const openCreateModal = () => {
    setNome('');
    setEmail('');
    setPassword('');
    setPerfil('worker');
    setSelectedProjetos([]);
    setFormErrors({});
    setIsCreateOpen(true);
  };

  const toggleProjeto = (projetoId: string) => {
    setSelectedProjetos((prev) =>
      prev.includes(projetoId)
        ? prev.filter((id) => id !== projetoId)
        : [...prev, projetoId],
    );
  };

  const handleGeneratePassword = () => {
    setPassword(generateStrongPassword());
  };

  const handleCopyPassword = async () => {
    if (!password) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(password);
      showToast({ type: 'info', message: 'Senha inicial copiada.' });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: { nome?: string; email?: string; password?: string } = {};

    if (!nome.trim()) {
      errors.nome = 'O nome completo é obrigatório.';
    }
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      errors.email = 'Informe um e-mail válido.';
    }
    if (password.length < 8) {
      errors.password = 'A senha inicial deve ter pelo menos 8 caracteres.';
    }

    if (errors.nome || errors.email || errors.password) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSaving(true);
    try {
      await createUsuario(getClient(), {
        nome,
        email,
        password,
        perfil,
        projetoIds: selectedProjetos,
      });
      showToast({
        type: 'success',
        message: 'Usuário cadastrado com sucesso.',
      });
      setIsCreateOpen(false);
      await loadData();
    } catch (error) {
      showToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao cadastrar usuário.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="card">
      <div className="page-header">
        <div>
          <h1>Usuários</h1>
          <p className="login-subtitle">
            Gerencie usuários, perfis de acesso e projetos vinculados.
          </p>
        </div>
        <Button variant="primary" onClick={openCreateModal}>
          <Plus size={18} aria-hidden="true" />
          <span>Novo Usuário</span>
        </Button>
      </div>

      <div className="filters-bar-3">
        <Input
          label="Buscar"
          placeholder="Buscar por nome ou e-mail"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <div className="field-group">
          <label htmlFor="usuario-perfil-filter" className="field-label">
            Perfil
          </label>
          <select
            id="usuario-perfil-filter"
            className="field-input"
            value={perfilFilter}
            onChange={(event) =>
              setPerfilFilter(event.target.value as PerfilFilter)
            }
          >
            <option value="todos">Todos</option>
            <option value="admin">Admin</option>
            <option value="worker">Worker</option>
          </select>
        </div>
        <div className="field-group">
          <label htmlFor="usuario-status-filter" className="field-label">
            Status
          </label>
          <select
            id="usuario-status-filter"
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
        <LoadingState message="Carregando usuários..." />
      ) : filteredUsuarios.length === 0 ? (
        <EmptyState
          title="Nenhum usuário encontrado"
          description="Nenhum usuário corresponde aos filtros aplicados."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearchTerm('');
                setPerfilFilter('todos');
                setStatusFilter('todos');
              }}
            >
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Projetos vinculados</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <td>
                    <strong>{usuario.nome}</strong>
                  </td>
                  <td>{usuario.email}</td>
                  <td>
                    <Badge variant={usuario.perfil}>
                      {usuario.perfil === 'admin' ? 'Admin' : 'Worker'}
                    </Badge>
                  </td>
                  <td>
                    <Badge variant={usuario.ativo ? 'success' : 'warning'}>
                      {usuario.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td>
                    {usuario.projetos_vinculados.length > 0
                      ? usuario.projetos_vinculados.map((p) => p.nome).join(', ')
                      : 'Nenhum'}
                  </td>
                  <td>{formatUtcToLocalDateTime(usuario.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isCreateOpen}
        title="Novo Usuário"
        onClose={() => setIsCreateOpen(false)}
      >
        <form className="form-stack" onSubmit={handleSubmit} noValidate>
          <Input
            label="Nome completo"
            name="nome"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            error={formErrors.nome}
            placeholder="Ex.: Ana Silva"
            disabled={isSaving}
          />
          <Input
            label="E-mail"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={formErrors.email}
            placeholder="ana@empresa.com"
            disabled={isSaving}
          />
          <div className="form-stack">
            <Input
              label="Senha inicial"
              name="password"
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={formErrors.password}
              placeholder="Mínimo 8 caracteres"
              disabled={isSaving}
            />
            <div className="actions-row">
              <Button
                variant="secondary"
                onClick={handleGeneratePassword}
                disabled={isSaving}
              >
                <KeyRound size={16} aria-hidden="true" />
                <span>Gerar senha</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => void handleCopyPassword()}
                disabled={!password || isSaving}
              >
                <Copy size={16} aria-hidden="true" />
                <span>Copiar</span>
              </Button>
            </div>
            <small className="login-subtitle">
              Oriente o usuário a alterar a senha inicial no primeiro acesso.
            </small>
          </div>

          <div className="field-group">
            <label htmlFor="usuario-perfil-select" className="field-label">
              Perfil
            </label>
            <select
              id="usuario-perfil-select"
              className="field-input"
              value={perfil}
              onChange={(event) => setPerfil(event.target.value as PerfilNome)}
              disabled={isSaving}
            >
              <option value="worker">Worker</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="field-group">
            <span className="field-label">Projetos vinculados (opcional)</span>
            {projetosAtivos.length === 0 ? (
              <span className="login-subtitle">
                Nenhum projeto ativo disponível.
              </span>
            ) : (
              <div className="checkbox-list">
                {projetosAtivos.map((proj) => (
                  <label key={proj.id} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={selectedProjetos.includes(proj.id)}
                      onChange={() => toggleProjeto(proj.id)}
                      disabled={isSaving}
                    />
                    <span>{proj.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <Button
              variant="secondary"
              onClick={() => setIsCreateOpen(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              Cadastrar
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
