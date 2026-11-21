import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import * as csvModule from '../../lib/csv';
import { formatUtcToLocalDateTimeInput } from '../../lib/dateTime';
import { RelatoriosPage, type RelatoriosPageProps } from './RelatoriosPage';

interface MockRow {
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
  usuarios: { id: string; nome: string; email?: string; ativo: boolean };
  projetos: { id: string; nome: string; ativo: boolean };
}

function createMockSupabase(
  rows: MockRow[],
  options?: {
    linkedProjectIds?: string[];
    rpcImpl?: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  },
) {
  const usuarios = [
    { id: 'u-maria', nome: 'Maria', ativo: true },
    { id: 'u-joao', nome: 'João', ativo: false },
    { id: 'u-admin', nome: 'Carlos Admin', ativo: true },
  ];
  const projetos = [
    { id: 'p-beta', nome: 'Projeto Beta', ativo: true },
    { id: 'p-alpha', nome: 'Projeto Alpha', ativo: false },
  ];

  const from = vi.fn((table: string) => {
    if (table === 'usuarios') {
      const builder = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: usuarios, error: null }),
        in: vi.fn().mockResolvedValue({ data: usuarios, error: null }),
      };
      return builder;
    }

    if (table === 'projetos') {
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: projetos, error: null }),
      };
    }

    if (table === 'usuario_projetos') {
      const linked = (options?.linkedProjectIds ?? ['p-beta']).map((id) => ({
        projeto_id: id,
      }));
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: linked, error: null }),
      };
    }

    const filters: Array<(row: MockRow) => boolean> = [];
    const builder = {
      select: vi.fn().mockReturnThis(),
      gte: vi.fn((_col: string, val: string) => {
        filters.push((r) => r.horario_entrada >= val);
        return builder;
      }),
      lte: vi.fn((_col: string, val: string) => {
        filters.push((r) => r.horario_entrada <= val);
        return builder;
      }),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn((col: string, val: string) => {
        if (col === 'usuario_id') filters.push((r) => r.usuario_id === val);
        if (col === 'projeto_id') filters.push((r) => r.projeto_id === val);
        return builder;
      }),
      is: vi.fn((col: string, val: null) => {
        if (col === 'excluido_em' && val === null) {
          filters.push((r) => r.excluido_em === null);
        }
        if (col === 'horario_saida' && val === null) {
          filters.push((r) => r.horario_saida === null);
        }
        return builder;
      }),
      not: vi.fn((col: string, _op: string, val: null) => {
        if (col === 'horario_saida' && val === null) {
          filters.push((r) => r.horario_saida !== null);
        }
        if (col === 'atualizado_em' && val === null) {
          filters.push((r) => r.atualizado_em !== null);
        }
        return builder;
      }),
      then: (resolve: (value: { data: MockRow[]; error: null }) => void) => {
        const filtered = rows
          .filter((r) => filters.every((fn) => fn(r)))
          .sort((a, b) => b.horario_entrada.localeCompare(a.horario_entrada));
        return Promise.resolve({ data: filtered, error: null }).then(resolve);
      },
    };
    return builder;
  });

  const rpc = vi.fn(
    options?.rpcImpl ??
      (async () => ({
        data: { id: 'ok' },
        error: null,
      })),
  );

  return { from, rpc } as unknown as SupabaseClient;
}

function renderRelatorios(props: RelatoriosPageProps) {
  return render(
    <ToastProvider>
      <RelatoriosPage {...props} />
    </ToastProvider>,
  );
}

describe('RelatoriosPage (UC-10)', () => {
  const sampleRows: MockRow[] = [
    {
      id: 'r1',
      usuario_id: 'u-maria',
      projeto_id: 'p-beta',
      horario_entrada: '2026-11-10T10:00:00.000Z',
      horario_saida: '2026-11-10T12:30:00.000Z',
      observacoes: 'Implementação API',
      atualizado_em: '2026-11-10T14:00:00.000Z',
      atualizado_por: 'u-admin',
      excluido_em: null,
      excluido_por: null,
      usuarios: { id: 'u-maria', nome: 'Maria', ativo: true },
      projetos: { id: 'p-beta', nome: 'Projeto Beta', ativo: true },
    },
    {
      id: 'r2',
      usuario_id: 'u-joao',
      projeto_id: 'p-alpha',
      horario_entrada: '2026-11-11T08:00:00.000Z',
      horario_saida: null,
      observacoes: null,
      atualizado_em: null,
      atualizado_por: null,
      excluido_em: null,
      excluido_por: null,
      usuarios: { id: 'u-joao', nome: 'João', ativo: false },
      projetos: { id: 'p-alpha', nome: 'Projeto Alpha', ativo: false },
    },
    {
      id: 'r3',
      usuario_id: 'u-maria',
      projeto_id: 'p-beta',
      horario_entrada: '2026-11-09T09:00:00.000Z',
      horario_saida: '2026-11-09T11:00:00.000Z',
      observacoes: 'Batida duplicada',
      atualizado_em: null,
      atualizado_por: null,
      excluido_em: '2026-11-09T13:00:00.000Z',
      excluido_por: 'u-admin',
      usuarios: { id: 'u-maria', nome: 'Maria', ativo: true },
      projetos: { id: 'p-beta', nome: 'Projeto Beta', ativo: true },
    },
  ];

  it('exibe indicadores, metadados de auditoria e sessão em andamento com alerta >12h', async () => {
    const client = createMockSupabase(sampleRows);
    const nowMs = new Date('2026-11-11T21:30:00.000Z').getTime();

    renderRelatorios({ supabaseClient: client, initialNowMs: nowMs });

    await waitFor(() => {
      expect(screen.getByTestId('total-horas-acumuladas')).toHaveTextContent(
        '02:30',
      );
    });

    expect(screen.getByTestId('total-registros')).toHaveTextContent('2');
    expect(screen.getByTestId('sessoes-em-andamento')).toHaveTextContent('1');

    const table = screen.getByTestId('relatorios-table');
    expect(within(table).getByText('Implementação API')).toBeInTheDocument();
    expect(
      within(table).getByText(/Editado por Carlos Admin em/),
    ).toBeInTheDocument();
    expect(within(table).getByText('Em andamento')).toBeInTheDocument();
    expect(within(table).getByText('Aberta há mais de 12h')).toBeInTheDocument();
  });

  it('aplica filtros combinados e inclui excluídos para auditoria sem contaminar totais', async () => {
    const user = userEvent.setup();
    const client = createMockSupabase(sampleRows);

    renderRelatorios({ supabaseClient: client });

    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('2');
    });

    await user.selectOptions(screen.getByLabelText('Usuário'), 'u-maria');
    await user.selectOptions(screen.getByLabelText('Projeto'), 'p-beta');

    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('1');
      expect(screen.getByTestId('total-horas-acumuladas')).toHaveTextContent(
        '02:30',
      );
    });

    await user.click(screen.getByLabelText('Incluir excluídos (Auditoria)'));

    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('2');
    });
    // Total acumulado permanece 02:30 (registro excluído não soma)
    expect(screen.getByTestId('total-horas-acumuladas')).toHaveTextContent(
      '02:30',
    );
    const table = screen.getByTestId('relatorios-table');
    expect(
      within(table).getByText(/Excluído por Carlos Admin em/),
    ).toBeInTheDocument();
  });

  it('expande resumo agrupado por projeto e usuário e pagina sem distorcer totais', async () => {
    const user = userEvent.setup();
    const client = createMockSupabase(sampleRows);

    renderRelatorios({ supabaseClient: client, pageSize: 1 });

    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('2');
    });

    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: /Resumo agrupado \(Horas por Projeto e por Usuário\)/,
      }),
    );

    expect(screen.getByText('Horas por Projeto')).toBeInTheDocument();
    expect(screen.getByText('Horas por Usuário')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    expect(screen.getByTestId('total-horas-acumuladas')).toHaveTextContent(
      '02:30',
    );
  });

  it('valida data inicial maior que data final e exibe estado vazio com limpar filtros', async () => {
    const user = userEvent.setup();
    const client = createMockSupabase(sampleRows);

    renderRelatorios({ supabaseClient: client });

    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('2');
    });

    const dataInicial = screen.getByLabelText('Data inicial');
    const dataFinal = screen.getByLabelText('Data final');

    await user.clear(dataInicial);
    await user.type(dataInicial, '2026-11-25');
    await user.clear(dataFinal);
    await user.type(dataFinal, '2026-11-10');

    expect(
      screen.getByText('A data inicial não pode ser maior que a data final.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    await user.selectOptions(screen.getByLabelText('Status'), 'encerrados');

    await waitFor(() => {
      expect(screen.getByText('Nenhum registro encontrado')).toBeInTheDocument();
    });
    expect(screen.getByTestId('total-horas-acumuladas')).toHaveTextContent(
      '00:00',
    );

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('2');
    });
  });

  it('dispara ações de Editar, Excluir e Exportar CSV com callbacks ou fallback de toast', async () => {
    const user = userEvent.setup();
    const client = createMockSupabase(sampleRows);
    const onEditRegistro = vi.fn();
    const onDeleteRegistro = vi.fn();
    const onExportCsv = vi.fn();

    const first = renderRelatorios({
      supabaseClient: client,
      onEditRegistro,
      onDeleteRegistro,
      onExportCsv,
    });

    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('2');
    });

    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(onExportCsv).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: 'Editar registro de Maria' }),
    );
    expect(onEditRegistro).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: 'Excluir registro de Maria' }),
    );
    expect(onDeleteRegistro).toHaveBeenCalledTimes(1);

    first.unmount();

    const downloadSpy = vi
      .spyOn(csvModule, 'downloadCsvFile')
      .mockImplementation(() => {});

    renderRelatorios({ supabaseClient: client });
    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('2');
    });

    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText('Relatório CSV exportado com sucesso.'),
    ).toBeInTheDocument();
    downloadSpy.mockRestore();

    await user.click(
      screen.getByRole('button', { name: 'Editar registro de Maria' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Editar Registro de Ponto' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    await user.click(
      screen.getByRole('button', { name: 'Excluir registro de Maria' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Excluir Registro de Ponto' }),
    ).toBeInTheDocument();
  });

  it('exporta CSV com colunas de auditoria e exclui registros deletados mesmo com auditoria marcada (UC-12 FA03)', async () => {
    const user = userEvent.setup();
    const rowsWithEmail: MockRow[] = sampleRows.map((row) => ({
      ...row,
      usuarios: {
        ...row.usuarios,
        email: `${row.usuarios.id}@pontolele.com`,
      },
    }));

    const downloadSpy = vi
      .spyOn(csvModule, 'downloadCsvFile')
      .mockImplementation(() => {});

    const client = createMockSupabase(rowsWithEmail);
    renderRelatorios({ supabaseClient: client });

    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('2');
    });

    await user.click(screen.getByLabelText('Incluir excluídos (Auditoria)'));

    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('3');
    });

    await user.selectOptions(screen.getByLabelText('Usuário'), 'u-maria');

    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('2');
    });

    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    const [csvText, filename] = downloadSpy.mock.calls[0]!;

    expect(filename).toMatch(/^pontos_maria_\d{4}-\d{2}-\d{2}_a_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csvText.startsWith('\uFEFF')).toBe(true);
    expect(csvText).toContain(
      'Usuario;Email;Projeto;Data_Entrada;Hora_Entrada;Data_Saida;Hora_Saida;Duracao_HHMM;Duracao_Horas_Decimais;Observacoes;Editado_Por;Editado_Em',
    );
    expect(csvText).toContain('u-maria@pontolele.com');
    expect(csvText).toContain('Carlos Admin');
    expect(csvText).not.toContain('Batida duplicada');
    expect(csvText).toContain('TOTAL;;;;;;;02:30;2,50;;;');

    downloadSpy.mockRestore();
  });

  it('desabilita Exportar CSV sem registros ativos e exibe toast de erro em falha de download (UC-12)', async () => {
    const user = userEvent.setup();
    const onlyDeletedRows: MockRow[] = [sampleRows[2]!];
    const emptyClient = createMockSupabase(onlyDeletedRows);

    const first = renderRelatorios({ supabaseClient: emptyClient });
    await waitFor(() => {
      expect(screen.getByText('Nenhum registro encontrado')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled();

    await user.click(screen.getByLabelText('Incluir excluídos (Auditoria)'));
    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('1');
    });
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled();
    first.unmount();

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => {
        throw new Error('Erro de exportação CSV');
      }),
      revokeObjectURL: vi.fn(),
    });

    const client = createMockSupabase(sampleRows);
    renderRelatorios({ supabaseClient: client });

    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('2');
    });

    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(screen.getByText('Erro de exportação CSV')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('edita registro com prévia de duração, valida RN04/FE05 e recarrega relatório (UC-11)', async () => {
    const user = userEvent.setup();
    const mutableRows = sampleRows.map((r) => ({ ...r }));
    const rpcImpl = vi.fn(async (fn: string, params: Record<string, unknown>) => {
      if (fn === 'editar_ponto_admin') {
        const target = mutableRows.find((r) => r.id === params.p_registro_id);
        if (target) {
          target.horario_entrada = params.p_horario_entrada as string;
          target.horario_saida = params.p_horario_saida as string | null;
          target.observacoes = (params.p_observacoes as string | null) ?? null;
          target.atualizado_em = '2026-11-10T15:00:00.000Z';
          target.atualizado_por = 'u-admin';
        }
      }
      return { data: { id: params.p_registro_id }, error: null };
    });

    const client = createMockSupabase(mutableRows, {
      linkedProjectIds: ['p-beta'],
      rpcImpl,
    });

    renderRelatorios({ supabaseClient: client });

    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('2');
    });

    await user.click(
      screen.getByRole('button', { name: 'Editar registro de Maria' }),
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Editar Registro de Ponto',
    });
    expect(within(dialog).getByTestId('editar-usuario-nome')).toHaveTextContent(
      'Maria',
    );
    expect(
      within(dialog).getByRole('option', { name: 'Projeto Beta (Vinculado)' }),
    ).toBeInTheDocument();

    // FE05: botão desabilitado sem alterações reais
    const saveButton = within(dialog).getByRole('button', {
      name: 'Salvar alterações',
    });
    expect(saveButton).toBeDisabled();
    expect(within(dialog).getByTestId('editar-duracao-previa')).toHaveTextContent(
      '02:30:00',
    );

    // RN04: horário de saída anterior ao de entrada bloqueia envio
    const entradaInput = within(dialog).getByLabelText('Horário de entrada');
    const saidaInput = within(dialog).getByLabelText('Horário de saída');
    const entradaBeforeSaida = formatUtcToLocalDateTimeInput(
      '2026-11-10T09:00:00.000Z',
    );
    await user.clear(saidaInput);
    await user.type(saidaInput, entradaBeforeSaida);

    expect(
      within(dialog).getByText(
        'O horário de saída não pode ser anterior ao horário de entrada.',
      ),
    ).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    // Edição válida (+1h na saída => 03:30:00)
    const novaSaidaLocal = formatUtcToLocalDateTimeInput(
      '2026-11-10T13:30:00.000Z',
    );
    await user.clear(saidaInput);
    await user.type(saidaInput, novaSaidaLocal);
    expect(within(dialog).getByTestId('editar-duracao-previa')).toHaveTextContent(
      '03:30:00',
    );
    expect(entradaInput).toBeInTheDocument();
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    await waitFor(() => {
      expect(rpcImpl).toHaveBeenCalledWith('editar_ponto_admin', {
        p_registro_id: 'r1',
        p_projeto_id: 'p-beta',
        p_horario_entrada: '2026-11-10T10:00:00.000Z',
        p_horario_saida: '2026-11-10T13:30:00.000Z',
        p_observacoes: 'Implementação API',
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText('Registro de ponto atualizado com sucesso.'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('total-horas-acumuladas')).toHaveTextContent(
        '03:30',
      );
    });
  });

  it('exibe erro da RPC no modal de edição (RN01 / RECORD_NOT_FOUND) e exclui registro com auditoria (UC-11)', async () => {
    const user = userEvent.setup();
    const mutableRows = sampleRows.map((r) => ({ ...r }));
    const rpcImpl = vi.fn(async (fn: string, params: Record<string, unknown>) => {
      if (fn === 'editar_ponto_admin') {
        return {
          data: null,
          error: {
            code: '23505',
            message: 'uq_registros_ponto_sessao_ativa',
          },
        };
      }
      if (fn === 'excluir_ponto_admin') {
        const target = mutableRows.find((r) => r.id === params.p_registro_id);
        if (target) {
          target.excluido_em = '2026-11-10T16:00:00.000Z';
          target.excluido_por = 'u-admin';
        }
      }
      return { data: { id: params.p_registro_id }, error: null };
    });

    const client = createMockSupabase(mutableRows, { rpcImpl });
    renderRelatorios({ supabaseClient: client });

    await waitFor(() => {
      expect(screen.getByTestId('total-registros')).toHaveTextContent('2');
    });

    // Tenta reabrir registro fechado quando usuário já tem outro ponto aberto
    await user.click(
      screen.getByRole('button', { name: 'Editar registro de Maria' }),
    );
    const editDialog = screen.getByRole('dialog', {
      name: 'Editar Registro de Ponto',
    });
    await user.clear(within(editDialog).getByLabelText('Horário de saída'));
    expect(
      within(editDialog).getByTestId('editar-duracao-previa'),
    ).toHaveTextContent('Em andamento');

    await user.click(
      within(editDialog).getByRole('button', { name: 'Salvar alterações' }),
    );

    await waitFor(() => {
      expect(
        within(editDialog).getByText(
          'Não é possível reabrir este registro porque o usuário já possui outro ponto em andamento.',
        ),
      ).toBeInTheDocument();
    });

    await user.click(within(editDialog).getByRole('button', { name: 'Cancelar' }));

    // Exclui registro com confirmação explícita
    await user.click(
      screen.getByRole('button', { name: 'Excluir registro de Maria' }),
    );
    const deleteDialog = screen.getByRole('dialog', {
      name: 'Excluir Registro de Ponto',
    });
    expect(
      within(deleteDialog).getByText(/mantendo a trilha de auditoria da exclusão/),
    ).toBeInTheDocument();

    await user.click(
      within(deleteDialog).getByRole('button', { name: 'Confirmar exclusão' }),
    );

    await waitFor(() => {
      expect(rpcImpl).toHaveBeenCalledWith('excluir_ponto_admin', {
        p_registro_id: 'r1',
      });
      expect(
        screen.getByText('Registro de ponto excluído com sucesso.'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('total-registros')).toHaveTextContent('1');
      expect(screen.getByTestId('total-horas-acumuladas')).toHaveTextContent(
        '00:00',
      );
    });
  });
});
