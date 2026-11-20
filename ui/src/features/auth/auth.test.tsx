import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import {
  AuthServiceError,
  fetchUserProfile,
  signInWithEmailAndPassword,
} from './authService';

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => <div data-testid="vercel-analytics" />,
}));

function createMockSupabaseClient({
  signInResult = { data: { user: { id: 'u-1' } }, error: null },
  profileResult = {
    data: {
      id: 'u-1',
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
  sessionResult = { data: { session: null }, error: null },
}: {
  signInResult?: {
    data: { user: { id: string } | null };
    error: { message: string; status?: number } | null;
  };
  profileResult?: {
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  };
  sessionResult?: {
    data: { session: { user: { id: string } } | null };
    error: null;
  };
} = {}) {
  let authChangeCallback:
    | ((event: string, session: { user: { id: string } } | null) => void)
    | null = null;
  const unsubscribe = vi.fn();
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const signInWithPassword = vi.fn().mockResolvedValue(signInResult);
  const getSession = vi.fn().mockResolvedValue(sessionResult);
  const onAuthStateChange = vi.fn((cb) => {
    authChangeCallback = cb;
    return { data: { subscription: { unsubscribe } } };
  });

  const maybeSingle = vi.fn().mockResolvedValue(profileResult);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  const client = {
    auth: {
      signInWithPassword,
      signOut,
      getSession,
      onAuthStateChange,
    },
    from,
  } as unknown as SupabaseClient;

  return {
    client,
    signOut,
    signInWithPassword,
    getSession,
    unsubscribe,
    triggerAuthChange: (
      event: string,
      session: { user: { id: string } } | null,
    ) => {
      authChangeCallback?.(event, session);
    },
  };
}

describe('authService', () => {
  it('busca perfil ativo com perfis como objeto ou array', async () => {
    const mockObj = createMockSupabaseClient();
    const userObj = await fetchUserProfile(mockObj.client, 'u-1');
    expect(userObj.perfil).toBe('worker');

    const mockArr = createMockSupabaseClient({
      profileResult: {
        data: {
          id: 'u-admin',
          nome: 'Maria Admin',
          email: 'maria@pontolele.com',
          perfil_id: 'p-admin',
          ativo: true,
          inativado_em: null,
          criado_em: '2026-11-20T10:00:00.000Z',
          perfis: [{ nome: 'admin' }],
        },
        error: null,
      },
    });
    const userArr = await fetchUserProfile(mockArr.client, 'u-admin');
    expect(userArr.perfil).toBe('admin');
  });

  it('trata erros de banco, conta sem cadastro, conta inativa e credenciais inválidas', async () => {
    const dbErr = createMockSupabaseClient({
      profileResult: { data: null, error: { message: 'db error' } },
    });
    await expect(fetchUserProfile(dbErr.client, 'u-1')).rejects.toMatchObject({
      code: 'NETWORK_OR_DB',
    });

    const missing = createMockSupabaseClient({
      profileResult: { data: null, error: null },
    });
    await expect(
      signInWithEmailAndPassword(missing.client, 'a@b.com', '123456'),
    ).rejects.toMatchObject({ code: 'PROFILE_NOT_FOUND' });
    expect(missing.signOut).toHaveBeenCalledTimes(1);

    const inactive = createMockSupabaseClient({
      profileResult: {
        data: {
          id: 'u-1',
          nome: 'Inativo',
          email: 'a@b.com',
          perfil_id: 'p-1',
          ativo: false,
          inativado_em: '2026-11-20T10:00:00.000Z',
          criado_em: '2026-11-20T10:00:00.000Z',
          perfis: { nome: 'worker' },
        },
        error: null,
      },
    });
    await expect(
      signInWithEmailAndPassword(inactive.client, 'a@b.com', '123456'),
    ).rejects.toMatchObject({ code: 'INACTIVE_USER' });
    expect(inactive.signOut).toHaveBeenCalledTimes(1);

    const invalidCreds = createMockSupabaseClient({
      signInResult: {
        data: { user: null },
        error: { message: 'Invalid login credentials', status: 400 },
      },
    });
    await expect(
      signInWithEmailAndPassword(invalidCreds.client, 'a@b.com', 'errada'),
    ).rejects.toBeInstanceOf(AuthServiceError);

    const networkErr = createMockSupabaseClient({
      signInResult: {
        data: { user: null },
        error: { message: 'Service unavailable', status: 503 },
      },
    });
    await expect(
      signInWithEmailAndPassword(networkErr.client, 'a@b.com', '123456'),
    ).rejects.toMatchObject({ code: 'NETWORK_OR_DB' });
  });
});

describe('LoginPage e AuthProvider com Supabase mockado', () => {
  it('valida campos obrigatórios e formato de e-mail antes de enviar', async () => {
    const user = userEvent.setup();
    const { client } = createMockSupabaseClient();

    window.history.pushState({}, '', '/login');
    render(<App authProps={{ supabaseClient: client }} />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Entrar no Ponto Lelê' }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument();
  });

  it('alterna visibilidade da senha e realiza login válido como worker', async () => {
    const user = userEvent.setup();
    const { client, signInWithPassword } = createMockSupabaseClient();

    window.history.pushState({}, '', '/login');
    render(<App authProps={{ supabaseClient: client }} />);

    await waitFor(() => {
      expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    });

    const passwordInput = screen.getByLabelText('Senha');
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.type(screen.getByLabelText('E-mail'), 'joao@pontolele.com');
    await user.type(passwordInput, 'SenhaForte123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'joao@pontolele.com',
      password: 'SenhaForte123',
    });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Registrar Ponto' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('João Worker')).toBeInTheDocument();
  });

  it('exibe erro amigável em falha de login e preserva o e-mail digitado', async () => {
    const user = userEvent.setup();
    const { client } = createMockSupabaseClient({
      signInResult: {
        data: { user: null },
        error: { message: 'Invalid login credentials', status: 400 },
      },
    });

    window.history.pushState({}, '', '/login');
    render(<App authProps={{ supabaseClient: client }} />);

    await waitFor(() => {
      expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    });

    const emailInput = screen.getByLabelText('E-mail');
    await user.type(emailInput, 'joao@pontolele.com');
    await user.type(screen.getByLabelText('Senha'), 'errada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'E-mail ou senha inválidos.',
      );
    });
    expect(emailInput).toHaveValue('joao@pontolele.com');
  });

  it('restaura sessão ativa e reage a SIGNED_OUT via onAuthStateChange', async () => {
    const { client, triggerAuthChange } = createMockSupabaseClient({
      sessionResult: {
        data: { session: { user: { id: 'u-1' } } },
        error: null,
      },
    });

    window.history.pushState({}, '', '/ponto');
    render(<App authProps={{ supabaseClient: client }} />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Registrar Ponto' }),
      ).toBeInTheDocument();
    });

    triggerAuthChange('SIGNED_OUT', null);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Entrar no Ponto Lelê' }),
      ).toBeInTheDocument();
    });
  });
});
