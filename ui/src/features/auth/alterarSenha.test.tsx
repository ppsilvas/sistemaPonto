import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import type { Usuario } from '../../types/domain';
import { AuthServiceError, changeOwnPassword } from './authService';

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => <div data-testid="vercel-analytics" />,
}));

const workerUser: Usuario = {
  id: 'u-worker',
  nome: 'João Worker',
  email: 'joao@pontolele.com',
  perfil_id: 'p-worker',
  perfil: 'worker',
  ativo: true,
  inativado_em: null,
  criado_em: '2026-11-20T10:00:00.000Z',
};

const adminUser: Usuario = {
  id: 'u-admin',
  nome: 'Maria Admin',
  email: 'maria@pontolele.com',
  perfil_id: 'p-admin',
  perfil: 'admin',
  ativo: true,
  inativado_em: null,
  criado_em: '2026-11-20T10:00:00.000Z',
};

function createPasswordMockClient({
  signInResult = { data: { user: { id: 'u-worker' } }, error: null },
  profileResult = {
    data: {
      id: 'u-worker',
      nome: 'João Worker',
      email: 'joao@pontolele.com',
      perfil_id: 'p-worker',
      ativo: true,
      inativado_em: null,
      criado_em: '2026-11-20T10:00:00.000Z',
      perfis: { nome: 'worker' },
    },
    error: null,
  },
  updateUserResult = { data: { user: { id: 'u-worker' } }, error: null },
  sessionResult = {
    data: { session: { user: { id: 'u-worker' } } },
    error: null,
  },
}: {
  signInResult?: {
    data: { user: { id: string } | null };
    error: { message: string; status?: number } | null;
  };
  profileResult?: {
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  };
  updateUserResult?: {
    data: { user: { id: string } | null };
    error: { message: string; status?: number } | null;
  };
  sessionResult?: {
    data: { session: { user: { id: string } } | null };
    error: null;
  };
} = {}) {
  const signInWithPassword = vi.fn().mockResolvedValue(signInResult);
  const updateUser = vi.fn().mockResolvedValue(updateUserResult);
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const getSession = vi.fn().mockResolvedValue(sessionResult);
  const onAuthStateChange = vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  }));

  const maybeSingle = vi.fn().mockResolvedValue(profileResult);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  const client = {
    auth: {
      signInWithPassword,
      updateUser,
      signOut,
      getSession,
      onAuthStateChange,
    },
    from,
  } as unknown as SupabaseClient;

  return {
    client,
    signInWithPassword,
    updateUser,
    signOut,
  };
}

describe('changeOwnPassword (authService)', () => {
  it('valida senha atual, confirma perfil ativo e chama updateUser com a nova senha', async () => {
    const { client, signInWithPassword, updateUser } = createPasswordMockClient();

    await changeOwnPassword(
      client,
      ' joao@pontolele.com ',
      'SenhaAtual123',
      'NovaSenha456',
    );

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'joao@pontolele.com',
      password: 'SenhaAtual123',
    });
    expect(updateUser).toHaveBeenCalledWith({
      password: 'NovaSenha456',
    });
  });

  it('lança INVALID_CURRENT_PASSWORD quando a senha atual é rejeitada', async () => {
    const { client, updateUser } = createPasswordMockClient({
      signInResult: {
        data: { user: null },
        error: { message: 'Invalid login credentials', status: 400 },
      },
    });

    await expect(
      changeOwnPassword(client, 'joao@pontolele.com', 'Errada123', 'NovaSenha456'),
    ).rejects.toMatchObject({
      code: 'INVALID_CURRENT_PASSWORD',
      message: 'A senha atual informada está incorreta.',
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('trata rate limit e erro genérico ao validar senha atual', async () => {
    const rateLimitMock = createPasswordMockClient({
      signInResult: {
        data: { user: null },
        error: { message: 'Too many requests', status: 429 },
      },
    });
    await expect(
      changeOwnPassword(
        rateLimitMock.client,
        'joao@pontolele.com',
        'SenhaAtual123',
        'NovaSenha456',
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT' });

    const networkMock = createPasswordMockClient({
      signInResult: {
        data: { user: null },
        error: { message: 'Gateway timeout', status: 504 },
      },
    });
    await expect(
      changeOwnPassword(
        networkMock.client,
        'joao@pontolele.com',
        'SenhaAtual123',
        'NovaSenha456',
      ),
    ).rejects.toMatchObject({ code: 'NETWORK_OR_DB' });
  });

  it('aborta com SESSION_EXPIRED e faz signOut quando o usuário foi inativado', async () => {
    const { client, signOut, updateUser } = createPasswordMockClient({
      profileResult: {
        data: {
          id: 'u-worker',
          nome: 'João Worker',
          email: 'joao@pontolele.com',
          perfil_id: 'p-worker',
          ativo: false,
          inativado_em: '2026-11-20T12:00:00.000Z',
          criado_em: '2026-11-20T10:00:00.000Z',
          perfis: { nome: 'worker' },
        },
        error: null,
      },
    });

    await expect(
      changeOwnPassword(client, 'joao@pontolele.com', 'SenhaAtual123', 'NovaSenha456'),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('propaga NETWORK_OR_DB se a consulta de perfil falhar por erro de banco', async () => {
    const { client, updateUser } = createPasswordMockClient({
      profileResult: {
        data: null,
        error: { message: 'db down' },
      },
    });

    await expect(
      changeOwnPassword(client, 'joao@pontolele.com', 'SenhaAtual123', 'NovaSenha456'),
    ).rejects.toMatchObject({ code: 'NETWORK_OR_DB' });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('mapeia erros do updateUser (rate limit, sessão expirada, senha fraca e genérico)', async () => {
    const rateLimitMock = createPasswordMockClient({
      updateUserResult: {
        data: { user: null },
        error: { message: 'Email rate limit exceeded', status: 429 },
      },
    });
    await expect(
      changeOwnPassword(
        rateLimitMock.client,
        'joao@pontolele.com',
        'SenhaAtual123',
        'NovaSenha456',
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT' });

    const expiredMock = createPasswordMockClient({
      updateUserResult: {
        data: { user: null },
        error: { message: 'Auth session missing', status: 401 },
      },
    });
    await expect(
      changeOwnPassword(
        expiredMock.client,
        'joao@pontolele.com',
        'SenhaAtual123',
        'NovaSenha456',
      ),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });

    const weakMock = createPasswordMockClient({
      updateUserResult: {
        data: { user: null },
        error: { message: 'Password should be stronger', status: 422 },
      },
    });
    await expect(
      changeOwnPassword(
        weakMock.client,
        'joao@pontolele.com',
        'SenhaAtual123',
        'NovaSenha456',
      ),
    ).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });

    const genericMock = createPasswordMockClient({
      updateUserResult: {
        data: { user: null },
        error: { message: 'Unexpected server failure', status: 500 },
      },
    });
    await expect(
      changeOwnPassword(
        genericMock.client,
        'joao@pontolele.com',
        'SenhaAtual123',
        'NovaSenha456',
      ),
    ).rejects.toMatchObject({ code: 'NETWORK_OR_DB' });
  });
});

describe('AlterarSenhaPage (UC-02)', () => {
  it('permite acesso para worker e admin, inicia com campos vazios e alterna visibilidade das senhas', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/alterar-senha');
    const first = render(<App authProps={{ initialUser: workerUser }} />);

    expect(
      screen.getByRole('heading', { name: 'Alterar Senha' }),
    ).toBeInTheDocument();

    const currentInput = screen.getByLabelText('Senha atual');
    const newInput = screen.getByLabelText('Nova senha');
    const confirmInput = screen.getByLabelText('Confirmar nova senha');

    expect(currentInput).toHaveValue('');
    expect(newInput).toHaveValue('');
    expect(confirmInput).toHaveValue('');
    expect(currentInput).toHaveAttribute('type', 'password');
    expect(newInput).toHaveAttribute('type', 'password');
    expect(confirmInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Mostrar senha atual' }));
    await user.click(screen.getByRole('button', { name: 'Mostrar nova senha' }));
    await user.click(
      screen.getByRole('button', { name: 'Mostrar confirmação da nova senha' }),
    );

    expect(currentInput).toHaveAttribute('type', 'text');
    expect(newInput).toHaveAttribute('type', 'text');
    expect(confirmInput).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Ocultar senha atual' }));
    expect(currentInput).toHaveAttribute('type', 'password');

    first.unmount();

    window.history.pushState({}, '', '/alterar-senha');
    render(<App authProps={{ initialUser: adminUser }} />);
    expect(
      screen.getByRole('heading', { name: 'Alterar Senha' }),
    ).toBeInTheDocument();
  });

  it('valida obrigatoriedade, mínimo de 8 caracteres, senha igual à atual e confirmação divergente', async () => {
    const user = userEvent.setup();
    const onChangePassword = vi.fn();

    window.history.pushState({}, '', '/alterar-senha');
    render(
      <App authProps={{ initialUser: workerUser, onChangePassword }} />,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(screen.getByText('Informe sua senha atual.')).toBeInTheDocument();
    expect(
      screen.getByText('A nova senha deve ter pelo menos 8 caracteres.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A confirmação não confere com a nova senha.'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Senha atual'), 'SenhaAtual123');
    await user.type(screen.getByLabelText('Nova senha'), 'SenhaAtual123');
    await user.type(
      screen.getByLabelText('Confirmar nova senha'),
      'OutraSenha123',
    );
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    expect(
      screen.getByText('A nova senha deve ser diferente da senha atual.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A confirmação não confere com a nova senha.'),
    ).toBeInTheDocument();
    expect(onChangePassword).not.toHaveBeenCalled();
  });

  it('atualiza a senha com sucesso via Supabase mockado e limpa os campos', async () => {
    const user = userEvent.setup();
    const { client, signInWithPassword, updateUser } = createPasswordMockClient();

    window.history.pushState({}, '', '/alterar-senha');
    render(<App authProps={{ supabaseClient: client }} />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Alterar Senha' }),
      ).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Senha atual'), 'SenhaAtual123');
    await user.type(screen.getByLabelText('Nova senha'), 'NovaSenhaForte123');
    await user.type(
      screen.getByLabelText('Confirmar nova senha'),
      'NovaSenhaForte123',
    );
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    await waitFor(() => {
      expect(
        screen.getAllByText('Senha alterada com sucesso.').length,
      ).toBeGreaterThan(0);
    });

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'joao@pontolele.com',
      password: 'SenhaAtual123',
    });
    expect(updateUser).toHaveBeenCalledWith({
      password: 'NovaSenhaForte123',
    });

    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
    expect(screen.getByLabelText('Nova senha')).toHaveValue('');
    expect(screen.getByLabelText('Confirmar nova senha')).toHaveValue('');
  });

  it('exibe erros de senha atual incorreta, senha fraca do servidor e erro de rate limit', async () => {
    const user = userEvent.setup();
    const onChangePassword = vi
      .fn()
      .mockRejectedValueOnce(
        new AuthServiceError(
          'INVALID_CURRENT_PASSWORD',
          'A senha atual informada está incorreta.',
        ),
      )
      .mockRejectedValueOnce(
        new AuthServiceError(
          'WEAK_PASSWORD',
          'A nova senha não atende aos requisitos mínimos de segurança.',
        ),
      )
      .mockRejectedValueOnce(
        new AuthServiceError(
          'RATE_LIMIT',
          'Muitas tentativas seguidas. Aguarde alguns instantes antes de tentar novamente.',
        ),
      );

    window.history.pushState({}, '', '/alterar-senha');
    render(
      <App authProps={{ initialUser: workerUser, onChangePassword }} />,
    );

    await user.type(screen.getByLabelText('Senha atual'), 'SenhaErrada123');
    await user.type(screen.getByLabelText('Nova senha'), 'NovaSenha456');
    await user.type(
      screen.getByLabelText('Confirmar nova senha'),
      'NovaSenha456',
    );
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    await waitFor(() => {
      expect(
        screen.getByText('A senha atual informada está incorreta.'),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    await waitFor(() => {
      expect(
        screen.getByText(
          'A nova senha não atende aos requisitos mínimos de segurança.',
        ),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    await waitFor(() => {
      expect(
        screen.getByText(
          'Muitas tentativas seguidas. Aguarde alguns instantes antes de tentar novamente.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('encerra sessão e redireciona para /login se a sessão expirar durante a troca', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    const onChangePassword = vi
      .fn()
      .mockRejectedValue(
        new AuthServiceError(
          'SESSION_EXPIRED',
          'Sua sessão expirou. Faça login novamente.',
        ),
      );

    window.history.pushState({}, '', '/alterar-senha');
    render(
      <App
        authProps={{
          initialUser: workerUser,
          onSignOut,
          onChangePassword,
        }}
      />,
    );

    await user.type(screen.getByLabelText('Senha atual'), 'SenhaAtual123');
    await user.type(screen.getByLabelText('Nova senha'), 'NovaSenha456');
    await user.type(
      screen.getByLabelText('Confirmar nova senha'),
      'NovaSenha456',
    );
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Entrar no Ponto Lelê' }),
      ).toBeInTheDocument();
    });
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
