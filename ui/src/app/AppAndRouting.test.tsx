import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';
import { useAuth } from '../features/auth/AuthContext';
import type { Usuario } from '../types/domain';

vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => <div data-testid="vercel-analytics" />,
}));

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

function renderAt(path: string, authProps?: Parameters<typeof App>[0]['authProps']) {
  window.history.pushState({}, '', path);
  return render(<App authProps={authProps} />);
}

function AuthConsumerOutside() {
  useAuth();
  return null;
}

describe('App, Rotas, Guards e AppLayout', () => {
  it('lança erro quando useAuth é chamado fora de AuthProvider', () => {
    expect(() => render(<AuthConsumerOutside />)).toThrow(
      /useAuth deve ser usado dentro de AuthProvider/,
    );
  });

  it('redireciona usuário não autenticado ou inativo para /login', () => {
    const first = renderAt('/ponto', { initialUser: null });
    expect(
      screen.getByRole('heading', { name: 'Entrar no Ponto Lelê' }),
    ).toBeInTheDocument();
    first.unmount();

    renderAt('/ponto', {
      initialUser: { ...workerUser, ativo: false },
    });
    expect(
      screen.getByRole('heading', { name: 'Entrar no Ponto Lelê' }),
    ).toBeInTheDocument();
  });

  it('exibe estado de carregamento nos guards enquanto a sessão carrega', () => {
    const first = renderAt('/ponto', { initialLoading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Verificando sessão...');
    first.unmount();

    renderAt('/usuarios', { initialLoading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Verificando sessão...');
  });

  it('exibe menu de Worker e bloqueia rota de Admin com feedback discreto', async () => {
    renderAt('/usuarios', { initialUser: workerUser });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Registrar Ponto' }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText('Acesso restrito a administradores.'),
    ).toBeInTheDocument();
    expect(screen.getByText('João Worker')).toBeInTheDocument();
    expect(screen.getByText('Worker')).toBeInTheDocument();
    expect(screen.getAllByText('Registrar Ponto').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Meu Histórico').length).toBeGreaterThan(0);
    expect(screen.queryByText('Usuários')).not.toBeInTheDocument();
    expect(screen.getByTestId('vercel-analytics')).toBeInTheDocument();
  });

  it('permite que Admin acesse rotas administrativas e realize navegação e logout', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    renderAt('/relatorios', { initialUser: adminUser, onSignOut });

    expect(
      screen.getByRole('heading', { name: 'Relatório de Pontos' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Maria Admin')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Alterar senha' }));
    expect(
      screen.getByRole('heading', { name: 'Alterar Senha' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Entrar no Ponto Lelê' }),
      ).toBeInTheDocument();
    });
  });

  it('redireciona rota acentuada /relatórios para /relatorios preservando AdminRoute', async () => {
    const adminRender = renderAt('/relatórios', { initialUser: adminUser });
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Relatório de Pontos' }),
      ).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/relatorios');
    adminRender.unmount();

    renderAt('/relat%C3%B3rios', { initialUser: workerUser });
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Registrar Ponto' }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText('Acesso restrito a administradores.'),
    ).toBeInTheDocument();
  });
});
