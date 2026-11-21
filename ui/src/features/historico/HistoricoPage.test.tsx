import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import { AuthProvider } from '../auth/AuthContext';
import type { Usuario } from '../../types/domain';
import { HistoricoPage } from './HistoricoPage';

const workerUser: Usuario = {
  id: 'u-worker-1',
  nome: 'João Worker',
  email: 'joao@pontolele.com',
  perfil_id: 'p-worker',
  perfil: 'worker',
  ativo: true,
  inativado_em: null,
  criado_em: '2026-11-01T10:00:00.000Z',
};

interface MockRegistroRow {
  id: string;
  usuario_id: string;
  projeto_id: string;
  horario_entrada: string;
  horario_saida: string | null;
  observacoes: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
  excluido_em: string | null;
  excluido_por: string | null;
  projetos: { id: string; nome: string; ativo: boolean } | null;
}

interface MockLinkedProjectRow {
  projeto_id: string;
  projetos: { id: string; nome: string; ativo: boolean } | null;
}

function createHistoricoMockClient(options?: {
  linkedProjects?: MockLinkedProjectRow[];
  registros?: MockRegistroRow[];
  projectsError?: boolean;
  registrosError?: boolean;
}) {
  const linkedProjects = options?.linkedProjects ?? [];
  const registros = options?.registros ?? [];
  const queryCalls: Array<{
    filters: Record<string, unknown>;
    gte?: [string, string];
    lte?: [string, string];
  }> = [];

  const from = vi.fn((table: string) => {
    if (table === 'usuario_projetos') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({
            data: options?.projectsError ? null : linkedProjects,
            error: options?.projectsError ? { message: 'db error' } : null,
          })),
        })),
      };
    }

    if (table === 'registros_ponto') {
      return {
        select: vi.fn((columns: string) => {
          const state: {
            filters: Record<string, unknown>;
            gte?: [string, string];
            lte?: [string, string];
          } = { filters: {} };

          const isProjectHistoryOnly = !columns.includes('horario_entrada');

          const builder = {
            eq: vi.fn((col: string, val: unknown) => {
              state.filters[col] = val;
              return builder;
            }),
            is: vi.fn((col: string, val: unknown) => {
              state.filters[col] = val;
              if (isProjectHistoryOnly) {
                return Promise.resolve({
                  data: options?.projectsError
                    ? null
                    : registros.filter((r) => r.excluido_em === null),
                  error: options?.projectsError ? { message: 'db error' } : null,
                });
              }
              return builder;
            }),
            gte: vi.fn((col: string, val: string) => {
              state.gte = [col, val];
              return builder;
            }),
            lte: vi.fn((col: string, val: string) => {
              state.lte = [col, val];
              return builder;
            }),
            order: vi.fn(() => {
              queryCalls.push(state);
              const projectFilter = state.filters['projeto_id'] as
                | string
                | undefined;

              const filtered = registros.filter((row) => {
                if (row.usuario_id !== state.filters['usuario_id']) return false;
                if (row.excluido_em !== null) return false;
                if (projectFilter && row.projeto_id !== projectFilter) return false;
                if (state.gte && row.horario_entrada < state.gte[1]) return false;
                if (state.lte && row.horario_entrada > state.lte[1]) return false;
                return true;
              });

              const result = Promise.resolve({
                data: options?.registrosError ? null : filtered,
                error: options?.registrosError ? { message: 'db error' } : null,
              });

              return Object.assign(result, {
                eq: vi.fn((col: string, val: unknown) => {
                  state.filters[col] = val;
                  const afterProjectFilter = filtered.filter(
                    (row) => row.projeto_id === val,
                  );
                  return Promise.resolve({
                    data: options?.registrosError ? null : afterProjectFilter,
                    error: options?.registrosError ? { message: 'db error' } : null,
                  });
                }),
              });
            }),
          };

          return builder;
        }),
      };
    }

    throw new Error(`Tabela inesperada: ${table}`);
  });

  return {
    client: { from } as unknown as SupabaseClient,
    queryCalls,
  };
}

function renderHistoricoPage(
  client: SupabaseClient,
  onExportCsv?: Parameters<typeof HistoricoPage>[0]['onExportCsv'],
) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider initialUser={workerUser}>
          <HistoricoPage supabaseClient={client} onExportCsv={onExportCsv} />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('HistoricoPage (UC-09)', () => {
  it('calcula durações individuais, total acumulado exato e filtra por projeto (BDD 1 e 2)', async () => {
    const user = userEvent.setup();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = '10';

    const startA = new Date(year, now.getMonth(), 10, 9, 0, 0).toISOString();
    const endA = new Date(year, now.getMonth(), 10, 10, 30, 0).toISOString();
    const startB = new Date(year, now.getMonth(), 10, 13, 0, 0).toISOString();
    const endB = new Date(year, now.getMonth(), 10, 15, 15, 30).toISOString();

    const { client } = createHistoricoMockClient({
      linkedProjects: [
        {
          projeto_id: 'proj-a',
          projetos: { id: 'proj-a', nome: 'Projeto A', ativo: true },
        },
        {
          projeto_id: 'proj-b',
          projetos: { id: 'proj-b', nome: 'Projeto B', ativo: false },
        },
      ],
      registros: [
        {
          id: 'reg-a',
          usuario_id: workerUser.id,
          projeto_id: 'proj-a',
          horario_entrada: startA,
          horario_saida: endA,
          observacoes: 'Implementação do módulo de ponto',
          atualizado_em: null,
          atualizado_por: null,
          excluido_em: null,
          excluido_por: null,
          projetos: { id: 'proj-a', nome: 'Projeto A', ativo: true },
        },
        {
          id: 'reg-b',
          usuario_id: workerUser.id,
          projeto_id: 'proj-b',
          horario_entrada: startB,
          horario_saida: endB,
          observacoes:
            'Revisão detalhada de integração com banco de dados e validação de relatórios mensais para fechamento',
          atualizado_em: `${year}-${month}-${day}T18:00:00.000Z`,
          atualizado_por: 'admin-1',
          excluido_em: null,
          excluido_por: null,
          projetos: { id: 'proj-b', nome: 'Projeto B', ativo: false },
        },
        {
          id: 'reg-excluido',
          usuario_id: workerUser.id,
          projeto_id: 'proj-a',
          horario_entrada: startA,
          horario_saida: endA,
          observacoes: 'Excluído',
          atualizado_em: null,
          atualizado_por: null,
          excluido_em: `${year}-${month}-${day}T19:00:00.000Z`,
          excluido_por: 'admin-1',
          projetos: { id: 'proj-a', nome: 'Projeto A', ativo: true },
        },
      ],
    });

    const onExportCsv = vi.fn();
    renderHistoricoPage(client, onExportCsv);

    await waitFor(() => {
      expect(screen.getByTestId('historico-total')).toHaveTextContent(
        '03h 45m (3,76h)',
      );
    });

    expect(screen.getByText('Duração exata: 03:45:30')).toBeInTheDocument();
    expect(screen.getByText('2 sessões no período')).toBeInTheDocument();
    expect(screen.getAllByText('01:30:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('02:15:30').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Ajustado pelo administrador').length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Inativo').length).toBeGreaterThan(0);

    expect(
      screen.queryByRole('button', { name: /editar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /excluir/i }),
    ).not.toBeInTheDocument();

    const expandBtns = screen.getAllByRole('button', { name: 'Ver mais' });
    await user.click(expandBtns[0]!);
    expect(
      screen.getAllByRole('button', { name: 'Ver menos' }).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Exportar CSV/i }));
    expect(onExportCsv).toHaveBeenCalledTimes(1);

    const projectSelect = screen.getByLabelText('Projeto');
    expect(
      screen.getByRole('option', { name: 'Projeto B (Inativo)' }),
    ).toBeInTheDocument();

    await user.selectOptions(projectSelect, 'proj-a');

    await waitFor(() => {
      expect(screen.getByTestId('historico-total')).toHaveTextContent(
        '01h 30m (1,50h)',
      );
    });
    expect(screen.getByText('1 sessão no período')).toBeInTheDocument();
  });

  it('exibe sessão em andamento sem quebrar o cálculo e valida intervalo inválido', async () => {
    const user = userEvent.setup();
    const now = new Date();
    const ongoingStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      10,
      8,
      0,
      0,
    ).toISOString();

    const { client } = createHistoricoMockClient({
      registros: [
        {
          id: 'reg-open',
          usuario_id: workerUser.id,
          projeto_id: 'proj-a',
          horario_entrada: ongoingStart,
          horario_saida: null,
          observacoes: null,
          atualizado_em: null,
          atualizado_por: null,
          excluido_em: null,
          excluido_por: null,
          projetos: { id: 'proj-a', nome: 'Projeto A', ativo: true },
        },
      ],
    });

    renderHistoricoPage(client);

    await waitFor(() => {
      expect(screen.getByText('1 sessão em andamento')).toBeInTheDocument();
    });
    expect(screen.getByTestId('historico-total')).toHaveTextContent('00:00');
    expect(
      screen.getByRole('button', { name: /Exportar CSV/i }),
    ).toBeDisabled();

    const startInput = screen.getByLabelText('Data inicial');
    const endInput = screen.getByLabelText('Data final');
    fireEvent.change(startInput, { target: { value: '2026-11-25' } });
    fireEvent.change(endInput, { target: { value: '2026-11-10' } });

    expect(
      screen.getByText('A data inicial não pode ser posterior à data final.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(
      screen.queryByText('A data inicial não pode ser posterior à data final.'),
    ).not.toBeInTheDocument();
  });

  it('exibe estado vazio amigável e permite limpar filtros e usar atalhos', async () => {
    const user = userEvent.setup();
    const { client } = createHistoricoMockClient({
      registros: [],
    });

    renderHistoricoPage(client);

    await waitFor(() => {
      expect(
        screen.getByText('Nenhum registro de ponto encontrado para este período.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId('historico-total')).toHaveTextContent('00:00');

    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    await waitFor(() => {
      expect(
        screen.getByText('Nenhum registro de ponto encontrado para este período.'),
      ).toBeInTheDocument();
    });
  });

  it('pagina mais de 50 registros mantendo o total acumulado completo', async () => {
    const user = userEvent.setup();
    const now = new Date();
    const registros: MockRegistroRow[] = Array.from({ length: 55 }, (_, i) => {
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        5,
        8,
        0,
        0,
      );
      const end = new Date(
        now.getFullYear(),
        now.getMonth(),
        5,
        9,
        0,
        0,
      );
      return {
        id: `reg-${i}`,
        usuario_id: workerUser.id,
        projeto_id: 'proj-a',
        horario_entrada: start.toISOString(),
        horario_saida: end.toISOString(),
        observacoes: null,
        atualizado_em: null,
        atualizado_por: null,
        excluido_em: null,
        excluido_por: null,
        projetos: { id: 'proj-a', nome: 'Projeto A', ativo: true },
      };
    });

    const { client } = createHistoricoMockClient({ registros });
    renderHistoricoPage(client);

    await waitFor(() => {
      expect(screen.getByTestId('historico-total')).toHaveTextContent(
        '55h 00m (55,00h)',
      );
    });

    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
  });

  it('exibe toast de erro quando falha ao carregar projetos ou registros', async () => {
    const { client } = createHistoricoMockClient({
      projectsError: true,
      registrosError: true,
    });

    renderHistoricoPage(client);

    await waitFor(() => {
      expect(
        screen.getByText('Não foi possível carregar os projetos para filtro.'),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText('Não foi possível carregar seu histórico de pontos.'),
    ).toBeInTheDocument();
  });
});
