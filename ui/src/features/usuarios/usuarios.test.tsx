import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import { UsuariosPage } from './UsuariosPage';
import {
  createUsuario,
  generateStrongPassword,
  listProjetosAtivos,
  listUsuarios,
} from './usuariosService';

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
    usuario_projetos: [],
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
  usuarios?: typeof mockUsers;
  projetos?: typeof mockProjetos;
  usuariosError?: { message: string } | null;
  projetosError?: { message: string } | null;
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

  const from = vi.fn((table: string) => {
    if (table === 'usuarios') {
      return { select: usuariosSelect };
    }
    return { select: projSelect };
  });

  const invoke = vi.fn().mockResolvedValue(invokeResult);

  return {
    client: { from, functions: { invoke } } as unknown as SupabaseClient,
    invoke,
  };
}

describe('usuariosService', () => {
  it('lista usuários e projetos ativos e trata erros', async () => {
    const { client } = createMockSupabase();
    const users = await listUsuarios(client);
    expect(users).toHaveLength(2);
    expect(users[0]?.projetos_vinculados[0]?.nome).toBe('Projeto Alpha');
    expect(users[1]?.perfil).toBe('worker');

    const projs = await listProjetosAtivos(client);
    expect(projs).toHaveLength(1);

    const errClient = createMockSupabase({
      usuariosError: { message: 'err' },
      projetosError: { message: 'err' },
    }).client;
    await expect(listUsuarios(errClient)).rejects.toThrow(
      /Não foi possível carregar os usuários/,
    );
    await expect(listProjetosAtivos(errClient)).rejects.toThrow(
      /Não foi possível carregar os projetos ativos/,
    );
  });

  it('invoca Edge Function admin-create-user e trata erros HTTP com JSON', async () => {
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

    const conflictClient = createMockSupabase({
      invokeResult: {
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: {
            json: async () => ({
              error: 'Já existe um usuário cadastrado com este e-mail.',
            }),
          },
        },
      },
    }).client;

    await expect(
      createUsuario(conflictClient, {
        nome: 'Ana',
        email: 'ana@pontolele.com',
        password: 'Password123!',
        perfil: 'worker',
        projetoIds: [],
      }),
    ).rejects.toThrow(/Já existe um usuário cadastrado com este e-mail/);

    const emptyClient = createMockSupabase({
      invokeResult: { data: null, error: null },
    }).client;
    await expect(
      createUsuario(emptyClient, {
        nome: 'Ana',
        email: 'ana@pontolele.com',
        password: 'Password123!',
        perfil: 'worker',
        projetoIds: [],
      }),
    ).rejects.toThrow(/Resposta vazia ao cadastrar usuário/);
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

    render(
      <ToastProvider>
        <UsuariosPage supabaseClient={client} />
      </ToastProvider>,
    );

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

    render(
      <ToastProvider>
        <UsuariosPage supabaseClient={client} />
      </ToastProvider>,
    );

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

    await user.click(screen.getByLabelText('Projeto Alpha'));
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByText('Usuário cadastrado com sucesso.'),
    ).toBeInTheDocument();
  });

  it('exibe toast de erro quando o carregamento ou cadastro falha', async () => {
    const user = userEvent.setup();
    const { client: errLoadClient } = createMockSupabase({
      usuariosError: { message: 'erro' },
    });

    const first = render(
      <ToastProvider>
        <UsuariosPage supabaseClient={errLoadClient} />
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(
        screen.getByText('Não foi possível carregar os usuários.'),
      ).toBeInTheDocument();
    });
    first.unmount();

    const { client: errCreateClient } = createMockSupabase({
      projetos: [],
      invokeResult: {
        data: null,
        error: { message: 'Falha ao criar' },
      },
    });
    render(
      <ToastProvider>
        <UsuariosPage supabaseClient={errCreateClient} />
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Maria Admin')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Novo Usuário' }));
    await user.type(screen.getByLabelText('Nome completo'), 'Ana');
    await user.type(screen.getByLabelText('E-mail'), 'ana@pontolele.com');
    await user.type(screen.getByLabelText('Senha inicial'), 'SenhaForte123');
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => {
      expect(screen.getByText('Falha ao criar')).toBeInTheDocument();
    });
  });
});
