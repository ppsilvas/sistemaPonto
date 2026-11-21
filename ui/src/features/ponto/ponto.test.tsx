import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import type { Projeto, RegistroPonto, Usuario } from '../../types/domain';
import { AuthProvider } from '../auth/AuthContext';
import { PontoPage } from './PontoPage';

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

const projetoA: Projeto = {
  id: 'proj-a',
  nome: 'App Mobile',
  descricao: 'Aplicativo principal',
  ativo: true,
  inativado_em: null,
  criado_em: '2026-11-20T09:00:00.000Z',
};

const projetoB: Projeto = {
  id: 'proj-b',
  nome: 'API Pagamentos',
  descricao: 'Serviço de pagamentos',
  ativo: true,
  inativado_em: null,
  criado_em: '2026-11-20T09:00:00.000Z',
};

interface MockOptions {
  linkedProjects?: Projeto[];
  projectsError?: Error | null;
  activeSessionQueue?: Array<{
    data: (RegistroPonto & { projetos: { id: string; nome: string } | null }) | null;
    error?: Error | null;
  }>;
  rpcHandler?: (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

function createMockSupabase(options: MockOptions = {}): SupabaseClient {
  const sessionQueue = [...(options.activeSessionQueue ?? [{ data: null }])];

  const from = vi.fn((table: string) => {
    if (table === 'usuario_projetos') {
      const rows = (options.linkedProjects ?? []).map((p) => ({
        projeto_id: p.id,
        projetos: p,
      }));
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(() => chain),
        then: (resolve: (val: unknown) => void) =>
          resolve({
            data: options.projectsError ? null : rows,
            error: options.projectsError ?? null,
          }),
      };
      return chain;
    }

    if (table === 'registros_ponto') {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => {
          const next = sessionQueue.shift() ?? { data: null };
          return {
            data: next.data,
            error: next.error ?? null,
          };
        }),
      };
      return chain;
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  const rpc = vi.fn(
    async (fn: string, params: Record<string, unknown> = {}) => {
      if (options.rpcHandler) {
        return options.rpcHandler(fn, params);
      }
      return { data: null, error: null };
    },
  );

  return { from, rpc } as unknown as SupabaseClient;
}

function renderPontoPage(
  client: SupabaseClient,
  user: Usuario | null = workerUser,
) {
  return render(
    <MemoryRouter initialEntries={['/ponto']}>
      <ToastProvider>
        <AuthProvider initialUser={user}>
          <Routes>
            <Route path="/ponto" element={<PontoPage supabaseClient={client} />} />
            <Route path="/projetos" element={<h1>Página de Projetos</h1>} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('PontoPage — UC-07 (Start e Seleção de Projeto)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('inicia ponto com projeto selecionado e observações, exibindo cronômetro e bloqueando Start', async () => {
    const user = userEvent.setup();
    const nowIso = new Date(Date.now() - 5000).toISOString();
    const createdRecord: RegistroPonto = {
      id: 'reg-1',
      usuario_id: workerUser.id,
      projeto_id: projetoA.id,
      horario_entrada: nowIso,
      horario_saida: null,
      observacoes: 'Implementação tela login',
      atualizado_em: null,
      atualizado_por: null,
      excluido_em: null,
      excluido_por: null,
    };

    const client = createMockSupabase({
      linkedProjects: [projetoA, projetoB],
      rpcHandler: async (fn, params) => {
        expect(fn).toBe('iniciar_ponto');
        expect(params).toEqual({
          p_projeto_id: projetoA.id,
          p_observacoes: 'Implementação tela login',
        });
        return { data: createdRecord, error: null };
      },
    });

    renderPontoPage(client);

    const select = await screen.findByLabelText('Projeto');
    expect(select).toHaveValue('');

    // Tenta iniciar sem selecionar projeto (FE02)
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(
      screen.getByText('Selecione um projeto para iniciar.'),
    ).toBeInTheDocument();

    await user.selectOptions(select, projetoA.id);
    await user.type(
      screen.getByLabelText('Observações (opcional)'),
      '  Implementação tela login  ',
    );
    await user.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => {
      expect(screen.getByTestId('active-session-panel')).toBeInTheDocument();
    });

    expect(screen.getByText('Em andamento')).toBeInTheDocument();
    expect(screen.getByTestId('active-session-panel')).toHaveTextContent(
      'App Mobile',
    );
    expect(screen.getByTestId('ponto-timer').textContent).toMatch(
      /^\d{2}:\d{2}:\d{2}$/,
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    expect(screen.getByLabelText('Projeto')).toBeDisabled();
    expect(
      screen.getByText('Para trocar de projeto, pause o registro atual primeiro.'),
    ).toBeInTheDocument();
  });

  it('pré-seleciona automaticamente quando usuário possui apenas 1 projeto vinculado', async () => {
    const client = createMockSupabase({
      linkedProjects: [projetoA],
    });

    renderPontoPage(client);

    const select = await screen.findByLabelText('Projeto');
    expect(select).toHaveValue(projetoA.id);
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
  });

  it('exibe estado bloqueado quando não há projetos vinculados (Worker e Admin)', async () => {
    const user = userEvent.setup();
    const clientWorker = createMockSupabase({ linkedProjects: [] });
    const first = renderPontoPage(clientWorker, workerUser);

    expect(
      await screen.findByText('Nenhum projeto ativo vinculado'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ir para Projetos' })).not.toBeInTheDocument();
    first.unmount();

    const clientAdmin = createMockSupabase({ linkedProjects: [] });
    renderPontoPage(clientAdmin, adminUser);

    const projetosBtn = await screen.findByRole('button', {
      name: 'Ir para Projetos',
    });
    await user.click(projetosBtn);
    expect(screen.getByRole('heading', { name: 'Página de Projetos' })).toBeInTheDocument();
  });

  it('sincroniza sessão ativa quando RPC retorna ACTIVE_SESSION_EXISTS', async () => {
    const user = userEvent.setup();
    const existingSession = {
      id: 'reg-existing',
      usuario_id: workerUser.id,
      projeto_id: projetoB.id,
      horario_entrada: new Date(Date.now() - 120_000).toISOString(),
      horario_saida: null,
      observacoes: 'Sessão já aberta na outra aba',
      atualizado_em: null,
      atualizado_por: null,
      excluido_em: null,
      excluido_por: null,
      projetos: { id: projetoB.id, nome: projetoB.nome },
    };

    const client = createMockSupabase({
      linkedProjects: [projetoA, projetoB],
      activeSessionQueue: [{ data: null }, { data: existingSession }],
      rpcHandler: async () => ({
        data: null,
        error: { message: 'ACTIVE_SESSION_EXISTS: Já existe sessão ativa.' },
      }),
    });

    renderPontoPage(client);

    await user.selectOptions(await screen.findByLabelText('Projeto'), projetoA.id);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => {
      expect(
        screen.getByText('Você já possui um ponto em aberto.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId('active-session-panel')).toHaveTextContent(
      'API Pagamentos',
    );
    expect(screen.getByLabelText('Observações (opcional)')).toHaveValue(
      'Sessão já aberta na outra aba',
    );
  });

  it('trata PROJECT_NOT_LINKED recarregando projetos vinculados', async () => {
    const user = userEvent.setup();
    const client = createMockSupabase({
      linkedProjects: [projetoA],
      rpcHandler: async () => ({
        data: null,
        error: { message: 'PROJECT_NOT_LINKED: Projeto não vinculado.' },
      }),
    });

    renderPontoPage(client);

    await screen.findByLabelText('Projeto');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => {
      expect(
        screen.getByText('Este projeto não está mais ativo ou vinculado a você.'),
      ).toBeInTheDocument();
    });
  });

  it('preserva observações em erro de rede e sincroniza se registro já foi gravado', async () => {
    const user = userEvent.setup();
    const clientFail = createMockSupabase({
      linkedProjects: [projetoA],
      activeSessionQueue: [{ data: null }, { data: null }],
      rpcHandler: async () => ({
        data: null,
        error: { message: 'Network error' },
      }),
    });

    const first = renderPontoPage(clientFail);
    const obsInput = await screen.findByLabelText('Observações (opcional)');
    await user.type(obsInput, 'Texto preservado');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Não foi possível iniciar o ponto. Verifique sua conexão e tente novamente.',
        ),
      ).toBeInTheDocument();
    });
    expect(obsInput).toHaveValue('Texto preservado');
    first.unmount();

    const recoveredSession = {
      id: 'reg-recovered',
      usuario_id: workerUser.id,
      projeto_id: projetoA.id,
      horario_entrada: new Date().toISOString(),
      horario_saida: null,
      observacoes: 'Texto preservado',
      atualizado_em: null,
      atualizado_por: null,
      excluido_em: null,
      excluido_por: null,
      projetos: { id: projetoA.id, nome: projetoA.nome },
    };

    const clientRecover = createMockSupabase({
      linkedProjects: [projetoA],
      activeSessionQueue: [{ data: null }, { data: recoveredSession }],
      rpcHandler: async () => ({
        data: null,
        error: { message: 'Timeout' },
      }),
    });

    renderPontoPage(clientRecover);
    await user.type(
      await screen.findByLabelText('Observações (opcional)'),
      'Texto preservado',
    );
    await user.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => {
      expect(
        screen.getByText('Sua sessão de ponto foi iniciada e sincronizada.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId('active-session-panel')).toBeInTheDocument();
  });

  it('exibe toast de erro quando o carregamento inicial falha e atualiza cronômetro ao voltar visibilidade', async () => {
    const clientErr = createMockSupabase({
      projectsError: new Error('Falha de conexão'),
    });
    const first = renderPontoPage(clientErr);

    await waitFor(() => {
      expect(
        screen.getByText('Não foi possível carregar seus projetos vinculados.'),
      ).toBeInTheDocument();
    });
    first.unmount();

    vi.useFakeTimers();
    const startMs = Date.now() - 10_000;
    const clientActive = createMockSupabase({
      linkedProjects: [projetoA],
      activeSessionQueue: [
        {
          data: {
            id: 'reg-active',
            usuario_id: workerUser.id,
            projeto_id: projetoA.id,
            horario_entrada: new Date(startMs).toISOString(),
            horario_saida: null,
            observacoes: null,
            atualizado_em: null,
            atualizado_por: null,
            excluido_em: null,
            excluido_por: null,
            projetos: { id: projetoA.id, nome: projetoA.nome },
          },
        },
      ],
    });

    renderPontoPage(clientActive);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByTestId('ponto-timer').textContent).toBe('00:00:10');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(screen.getByTestId('ponto-timer').textContent).toBe('00:00:12');
  });

  it('cobre erro de fetchActiveSession, UNAUTHORIZED no Start e usuário nulo', async () => {
    const user = userEvent.setup();

    // Usuário nulo não tenta carregar nem iniciar
    const first = renderPontoPage(createMockSupabase(), null);
    expect(screen.getByRole('heading', { name: 'Registrar Ponto' })).toBeInTheDocument();
    first.unmount();

    // Erro ao consultar registros_ponto
    const clientSessionErr = createMockSupabase({
      linkedProjects: [projetoA],
      activeSessionQueue: [
        { data: null, error: new Error('Erro na consulta de sessão') },
      ],
    });
    const second = renderPontoPage(clientSessionErr);
    await waitFor(() => {
      expect(
        screen.getByText('Não foi possível verificar sua sessão de ponto ativa.'),
      ).toBeInTheDocument();
    });
    second.unmount();

    // Erro UNAUTHORIZED na RPC iniciar_ponto
    const clientUnauth = createMockSupabase({
      linkedProjects: [projetoA],
      activeSessionQueue: [{ data: null }, { data: null }],
      rpcHandler: async () => ({
        data: null,
        error: { message: 'UNAUTHORIZED: Usuário inativo.' },
      }),
    });
    renderPontoPage(clientUnauth);
    await screen.findByLabelText('Projeto');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => {
      expect(
        screen.getByText('Sessão expirada ou usuário inativo.'),
      ).toBeInTheDocument();
    });
  });

  it('normaliza observações vazias para null e trata relação em array/nula', async () => {
    const user = userEvent.setup();
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'usuario_projetos') {
          const chain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation(() => chain),
            then: (resolve: (val: unknown) => void) =>
              resolve({
                data: [
                  { projeto_id: projetoA.id, projetos: [projetoA] },
                  { projeto_id: 'proj-null', projetos: null },
                ],
                error: null,
              }),
          };
          return chain;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        };
      }),
      rpc: vi.fn(async (_fn: string, params: Record<string, unknown>) => {
        expect(params.p_observacoes).toBeNull();
        return {
          data: {
            id: 'reg-empty-obs',
            usuario_id: workerUser.id,
            projeto_id: projetoA.id,
            horario_entrada: new Date().toISOString(),
            horario_saida: null,
            observacoes: null,
            atualizado_em: null,
            atualizado_por: null,
            excluido_em: null,
            excluido_por: null,
          },
          error: null,
        };
      }),
    } as unknown as SupabaseClient;

    renderPontoPage(client);
    await screen.findByLabelText('Projeto');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => {
      expect(screen.getByTestId('active-session-panel')).toBeInTheDocument();
    });
  });
});
