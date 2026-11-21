import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import type { Usuario } from '../../types/domain';
import { AuthProvider } from '../auth/AuthContext';
import { UsuariosPage } from './UsuariosPage';
import {
  createUsuario,
  generateStrongPassword,
  hasOpenSessionForUser,
  listProjetosAtivos,
  listUsuarios,
  updateUsuario,
} from './usuariosService';

const currentAdmin: Usuario = {
  id: 'u-1',
  nome: 'Maria Admin',
  email: 'maria@pontolele.com',
  perfil_id: 'p-admin',
  perfil: 'admin',
  ativo: true,
  inativado_em: null,
  criado_em: '2026-11-20T12:00:00.000Z',
};

const mockUsers = [
  {
    id: 'u-1',
    nome: 'Maria Admin',
    email: 'maria@pontolele.com',
    perfil_id: 'p-admin',
    ativo: true,
    inativado_em: null,
    criado_em: '2026-11-20T12:00:00.000Z',
    perfis: { nome: 'admin' },
    usuario_projetos: [{ projetos: { id: 'proj-1', nome: 'Projeto Alpha' } }],
  },
  {
    id: 'u-2',
    nome: 'João Worker',
    email: 'joao@pontolele.com',
    perfil_id: 'p-worker',
    ativo: false,
    inativado_em: '2026-11-20T13:00:00.000Z',
    criado_em: '2026-11-20T11:00:00.000Z',
    perfis: [{ nome: 'worker' }],
    usuario_projetos: [
      { projetos: null },
      { projetos: [{ id: 'proj-2', nome: 'Projeto Beta' }] },
    ],
  },
];

const mockProjetos = [
  {
    id: 'proj-1',
    nome: 'Projeto Alpha',
    descricao: null,
    ativo: true,
    inativado_em: null,
    criado_em: '2026-11-20T10:00:00.000Z',
  },
];

function createMockSupabase({
  usuarios = mockUsers,
  projetos = mockProjetos,
  usuariosError = null,
  projetosError = null,
  openSessions = [] as Array<{ id: string }>,
  sessionsError = null as { message: string } | null,
  invokeResult = {
    data: {
      id: 'u-3',
      nome: 'Ana Silva',
      email: 'ana@pontolele.com',
      perfil_id: 'p-worker',
      ativo: true,
      inativado_em: null,
      criado_em: '2026-11-20T14:00:00.000Z',
    },
    error: null,
  },
}: {
  usuarios?: Array<Record<string, unknown>>;
  projetos?: typeof mockProjetos;
  usuariosError?: { message: string } | null;
  projetosError?: { message: string } | null;
  openSessions?: Array<{ id: string }>;
  sessionsError?: { message: string } | null;
  invokeResult?: { data: unknown; error: unknown };
} = {}) {
  const usuariosOrder = vi.fn().mockResolvedValue({
    data: usuariosError ? null : usuarios,
    error: usuariosError,
  });
  const usuariosSelect = vi.fn().mockReturnValue({ order: usuariosOrder });

  const projOrder = vi.fn().mockResolvedValue({
    data: projetosError ? null : projetos,
    error: projetosError,
  });
  const projEq = vi.fn().mockReturnValue({ order: projOrder });
  const projSelect = vi.fn().mockReturnValue({ eq: projEq });

  const regLimit = vi.fn().mockResolvedValue({
    data: sessionsError ? null : openSessions,
    error: sessionsError,
  });
  const regIs2 = vi.fn().mockReturnValue({ limit: regLimit });
  const regIs1 = vi.fn().mockReturnValue({ is: regIs2 });
  const regEq = vi.fn().mockReturnValue({ is: regIs1 });
  const regSelect = vi.fn().mockReturnValue({ eq: regEq });

  const from = vi.fn((table: string) => {
    if (table === 'usuarios') {
      return { select: usuariosSelect };
    }
    if (table === 'registros_ponto') {
      return { select: regSelect };
    }
    return { select: projSelect };
  });

  const invoke = vi.fn().mockResolvedValue(invokeResult);

  return {
    client: { from, functions: { invoke } } as unknown as SupabaseClient,
    invoke,
  };
}

function renderUsuariosPage(client: SupabaseClient) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider initialUser={currentAdmin}>
          <UsuariosPage supabaseClient={client} />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('usuariosService', () => {
  it('lista usuários, projetos ativos e verifica sessão aberta', async () => {
    const { client } = createMockSupabase({
      openSessions: [{ id: 'reg-1' }],
    });
    const users = await listUsuarios(client);
    expect(users).toHaveLength(2);
    expect(users[0]?.projetos_vinculados[0]?.nome).toBe('Projeto Alpha');
    expect(users[1]?.perfil).toBe('worker');

    const projs = await listProjetosAtivos(client);
    expect(projs).toHaveLength(1);

    await expect(hasOpenSessionForUser(client, 'u-1')).resolves.toBe(true);

    const errClient = createMockSupabase({
      usuariosError: { message: 'err' },
      projetosError: { message: 'err' },
      sessionsError: { message: 'err' },
    }).client;
    await expect(listUsuarios(errClient)).rejects.toThrow(
      /Não foi possível carregar os usuários/,
    );
    await expect(listProjetosAtivos(errClient)).rejects.toThrow(
      /Não foi possível carregar os projetos ativos/,
    );
    await expect(hasOpenSessionForUser(errClient, 'u-1')).rejects.toThrow(
      /Não foi possível verificar sessão em aberto/,
    );
  });

  it('invoca admin-create-user e admin-update-user tratando erros', async () => {
    const { client, invoke } = createMockSupabase();
    await createUsuario(client, {
      nome: '  Ana Silva  ',
      email: 'ANA@PONTOLELE.COM',
      password: 'Password123!',
      perfil: 'worker',
      projetoIds: ['proj-1'],
    });

    expect(invoke).toHaveBeenCalledWith('admin-create-user', {
      body: {
        nome: 'Ana Silva',
        email: 'ana@pontolele.com',
        password: 'Password123!',
        perfil: 'worker',
        projetoIds: ['proj-1'],
      },
    });

    await updateUsuario(client, {
      userId: 'u-2',
      nome: '  João Atualizado ',
      email: 'JOAO@PONTOLELE.COM',
      perfil: 'admin',
      ativo: true,
    });

    expect(invoke).toHaveBeenCalledWith('admin-update-user', {
      body: {
        userId: 'u-2',
        nome: 'João Atualizado',
        email: 'joao@pontolele.com',
        perfil: 'admin',
        ativo: true,
      },
    });

    const conflictClient = createMockSupabase({
      invokeResult: {
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: {
            json: async () => ({
              error: 'Este e-mail já está em uso por outro usuário.',
            }),
          },
        },
      },
    }).client;

    await expect(
      updateUsuario(conflictClient, {
        userId: 'u-2',
        nome: 'João',
        email: 'maria@pontolele.com',
        perfil: 'worker',
        ativo: true,
      }),
    ).rejects.toThrow(/Este e-mail já está em uso/);

    const emptyClient = createMockSupabase({
      invokeResult: { data: null, error: null },
    }).client;
    await expect(
      updateUsuario(emptyClient, {
        userId: 'u-2',
        nome: 'João',
        email: 'joao@pontolele.com',
        perfil: 'worker',
        ativo: true,
      }),
    ).rejects.toThrow(/Não foi possível atualizar o usuário/);

    const fallbackErrClient = createMockSupabase({
      invokeResult: { data: null, error: { message: '' } },
    }).client;
    await expect(
      updateUsuario(fallbackErrClient, {
        userId: 'u-2',
        nome: 'João',
        email: 'joao@pontolele.com',
        perfil: 'worker',
        ativo: true,
      }),
    ).rejects.toThrow(/Não foi possível atualizar o usuário/);
  });

  it('gera senha forte com comprimento esperado', () => {
    const pwd = generateStrongPassword(12);
    expect(pwd).toHaveLength(12);
  });
});

describe('UsuariosPage', () => {
  it('lista, filtra por busca, perfil e status e limpa filtros', async () => {
    const user = userEvent.setup();
    const { client } = createMockSupabase();

    renderUsuariosPage(client);

    await waitFor(() => {
      expect(screen.getByText('Maria Admin')).toBeInTheDocument();
    });
    expect(screen.getByText('João Worker')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Perfil'), 'admin');
    expect(screen.queryByText('João Worker')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Perfil'), 'todos');
    await user.selectOptions(screen.getByLabelText('Status'), 'inativos');
    expect(screen.queryByText('Maria Admin')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'todos');
    await user.type(screen.getByLabelText('Buscar'), 'inexistente');
    expect(screen.getByText('Nenhum usuário encontrado')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByText('Maria Admin')).toBeInTheDocument();
  });

  it('valida formulário e cadastra novo usuário com senha gerada e projeto vinculado', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const { client, invoke } = createMockSupabase();

    renderUsuariosPage(client);

    await waitFor(() => {
      expect(screen.getByText('Maria Admin')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Novo Usuário' }));
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(
      screen.getByText('O nome completo é obrigatório.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(
      screen.getByText('A senha inicial deve ter pelo menos 8 caracteres.'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nome completo'), 'Ana Silva');
    await user.type(screen.getByLabelText('E-mail'), 'ana@pontolele.com');
    await user.click(screen.getByRole('button', { name: 'Gerar senha' }));
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(writeText).toHaveBeenCalledTimes(1);

    await user.selectOptions(
      screen.getByLabelText('Perfil', { selector: '#usuario-perfil-select' }),
      'admin',
    );
    await user.click(screen.getByLabelText('Projeto Alpha'));
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByText('Usuário cadastrado com sucesso.'),
    ).toBeInTheDocument();
  });

  it('protege o último administrador ativo (RN05) na listagem e no modal de edição', async () => {
    const user = userEvent.setup();
    const { client } = createMockSupabase();

    renderUsuariosPage(client);

    await waitFor(() => {
      expect(screen.getByText('Maria Admin')).toBeInTheDocument();
    });

    const inativarBtn = screen.getByRole('button', { name: 'Inativar' });
    expect(inativarBtn).toBeDisabled();

    const editButtons = screen.getAllByRole('button', { name: 'Editar' });
    await user.click(editButtons[0]!);

    expect(
      screen.getByText(
        /Este é o único administrador ativo do sistema. Não é permitido inativá-lo/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Perfil', { selector: '#edit-usuario-perfil' })).toBeDisabled();
    expect(screen.getByLabelText('Usuário ativo')).toBeDisabled();
  });

  it('edita usuário, exige confirmação ao rebaixar próprio perfil e inativa com alerta de sessão aberta', async () => {
    const user = userEvent.setup();
    const twoAdmins = [
      mockUsers[0]!,
      {
        ...mockUsers[1]!,
        ativo: true,
        perfis: [{ nome: 'admin' }],
      },
    ];
    const { client, invoke } = createMockSupabase({
      usuarios: twoAdmins,
      openSessions: [{ id: 'reg-1' }],
    });

    renderUsuariosPage(client);

    await waitFor(() => {
      expect(screen.getByText('Maria Admin')).toBeInTheDocument();
    });

    // Inativar segundo admin com sessão aberta
    const inativarButtons = screen.getAllByRole('button', { name: 'Inativar' });
    await user.click(inativarButtons[1]!);

    await waitFor(() => {
      expect(
        screen.getByText(/Este usuário possui uma sessão de ponto em aberto/),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole('button', { name: 'Confirmar inativação' }),
    );
    expect(invoke).toHaveBeenCalledWith('admin-update-user', {
      body: expect.objectContaining({ userId: 'u-2', ativo: false }),
    });

    // Editar próprio perfil de admin para worker (exige confirmação)
    const editButtons = screen.getAllByRole('button', { name: 'Editar' });
    await user.click(editButtons[0]!);
    await user.click(screen.getByLabelText('Projeto Alpha'));
    await user.click(screen.getByLabelText('Projeto Alpha'));
    await user.selectOptions(
      screen.getByLabelText('Perfil', { selector: '#edit-usuario-perfil' }),
      'worker',
    );
    await user.click(
      screen.getByRole('button', { name: 'Salvar alterações' }),
    );

    expect(
      screen.getByText(/ao alterar seu próprio perfil para Worker/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Salvar alterações' }),
    );
    await waitFor(() => {
      expect(
        screen.getByText('Usuário atualizado com sucesso.'),
      ).toBeInTheDocument();
    });
  });

  it('reativa usuário inativo, valida edição e exibe erros de sessão/atualização', async () => {
    const user = userEvent.setup();
    const { client, invoke } = createMockSupabase({
      invokeResult: {
        data: null,
        error: { message: 'Falha no servidor' },
      },
    });

    renderUsuariosPage(client);

    await waitFor(() => {
      expect(screen.getByText('João Worker')).toBeInTheDocument();
    });

    // Reativar usuário inativo e testar erro
    await user.click(screen.getByRole('button', { name: 'Reativar' }));
    expect(
      screen.getByRole('dialog', { name: 'Reativar Usuário' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirmar reativação' }),
    );
    await waitFor(() => {
      expect(screen.getByText('Falha no servidor')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Validação no modal de edição
    const editButtons = screen.getAllByRole('button', { name: 'Editar' });
    await user.click(editButtons[1]!);
    await user.clear(screen.getByLabelText('Nome completo'));
    await user.clear(screen.getByLabelText('E-mail'));
    await user.click(
      screen.getByRole('button', { name: 'Salvar alterações' }),
    );
    expect(
      screen.getByText('O nome completo é obrigatório.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nome completo'), 'João Editado');
    await user.type(screen.getByLabelText('E-mail'), 'joao2@pontolele.com');
    await user.click(screen.getByLabelText('Usuário ativo'));
    await user.click(
      screen.getByRole('button', { name: 'Salvar alterações' }),
    );
    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });
    await user.click(screen.getByRole('button', { name: 'Fechar modal' }));
  });

  it('exibe erro ao falhar verificação de sessão aberta antes de inativar', async () => {
    const user = userEvent.setup();
    const { client } = createMockSupabase({
      usuarios: [
        mockUsers[0]!,
        { ...mockUsers[1]!, ativo: true, perfis: { nome: 'worker' } },
      ],
      sessionsError: { message: 'erro sessao' },
    });

    renderUsuariosPage(client);

    await waitFor(() => {
      expect(screen.getByText('João Worker')).toBeInTheDocument();
    });

    const inativarBtns = screen.getAllByRole('button', { name: 'Inativar' });
    await user.click(inativarBtns[1]!);

    await waitFor(() => {
      expect(
        screen.getByText('Não foi possível verificar sessão em aberto do usuário.'),
      ).toBeInTheDocument();
    });
  });

  it('exibe toast de erro quando o carregamento falha', async () => {
    const { client } = createMockSupabase({
      usuariosError: { message: 'erro' },
    });

    renderUsuariosPage(client);
    await waitFor(() => {
      expect(
        screen.getByText('Não foi possível carregar os usuários.'),
      ).toBeInTheDocument();
    });
  });
});
