import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import { ProjetosPage } from './ProjetosPage';
import {
  createProjeto,
  excluirProjeto,
  inativarProjeto,
  reativarProjeto,
  updateProjeto,
} from './projetosService';

interface MockProjetoRow {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  inativado_em: string | null;
  criado_em: string;
  usuario_projetos: Array<{ count: number }>;
  registros_ponto: Array<{ count: number }>;
}

const baseProjeto: MockProjetoRow = {
  id: 'proj-1',
  nome: 'Cliente Alpha',
  descricao: 'Redesign do portal institucional',
  ativo: true,
  inativado_em: null,
  criado_em: '2026-11-20T12:00:00.000Z',
  usuario_projetos: [{ count: 2 }],
  registros_ponto: [{ count: 0 }],
};

function createMockSupabase({
  projetos = [baseProjeto],
  openSessions = [],
  listError = null,
  insertError = null,
  updateError = null,
  deleteError = null,
  sessionsError = null,
}: {
  projetos?: MockProjetoRow[];
  openSessions?: Array<{
    id: string;
    usuarios: { nome: string } | Array<{ nome: string }> | null;
  }>;
  listError?: { message: string } | null;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
  deleteError?: { code?: string; message: string } | null;
  sessionsError?: { message: string } | null;
} = {}) {
  const projetosOrder = vi
    .fn()
    .mockResolvedValue({ data: listError ? null : projetos, error: listError });
  const projetosSelect = vi.fn().mockReturnValue({ order: projetosOrder });
  const insertSingle = vi.fn().mockResolvedValue({
    data: insertError
      ? null
      : { ...baseProjeto, id: 'proj-2', nome: 'Novo Projeto' },
    error: insertError,
  });
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
  const insert = vi.fn().mockReturnValue({ select: insertSelect });

  const updateSingle = vi.fn().mockResolvedValue({
    data: updateError ? null : { ...baseProjeto, ativo: false },
    error: updateError,
  });
  const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
  const updateEq = vi.fn().mockReturnValue({ select: updateSelect });
  const update = vi.fn().mockReturnValue({ eq: updateEq });

  const deleteEq = vi.fn().mockResolvedValue({ error: deleteError });
  const del = vi.fn().mockReturnValue({ eq: deleteEq });

  const regIs2 = vi.fn().mockResolvedValue({
    data: sessionsError ? null : openSessions,
    error: sessionsError,
  });
  const regIs1 = vi.fn().mockReturnValue({ is: regIs2 });
  const regEq = vi.fn().mockReturnValue({ is: regIs1 });
  const regSelect = vi.fn().mockReturnValue({ eq: regEq });

  const from = vi.fn((table: string) => {
    if (table === 'projetos') {
      return {
        select: projetosSelect,
        insert,
        update,
        delete: del,
      };
    }
    return {
      select: regSelect,
    };
  });

  return {
    client: { from } as unknown as SupabaseClient,
    insert,
    update,
    del,
  };
}

describe('projetosService', () => {
  it('valida nome obrigatório ao criar e atualizar projeto', async () => {
    const { client } = createMockSupabase();

    await expect(
      createProjeto(client, { nome: '   ' }),
    ).rejects.toThrow(/O nome do projeto é obrigatório/);

    await expect(
      updateProjeto(client, 'proj-1', { nome: '' }),
    ).rejects.toThrow(/O nome do projeto é obrigatório/);
  });

  it('bloqueia inativação ou exclusão quando existem sessões abertas', async () => {
    const { client } = createMockSupabase({
      openSessions: [{ id: 'reg-1', usuarios: { nome: 'João Worker' } }],
    });

    await expect(inativarProjeto(client, 'proj-1')).rejects.toThrow(
      /João Worker/,
    );
    await expect(excluirProjeto(client, 'proj-1')).rejects.toThrow(
      /João Worker/,
    );
  });

  it('trata erro 23503 (ON DELETE RESTRICT) na exclusão de projeto com histórico', async () => {
    const { client } = createMockSupabase({
      deleteError: { code: '23503', message: 'violates foreign key' },
    });

    await expect(excluirProjeto(client, 'proj-1')).rejects.toThrow(
      /só pode ser inativado para preservar o histórico/,
    );
  });

  it('reativa projeto inativo e trata erros de banco nas operações', async () => {
    const { client, update } = createMockSupabase();
    await reativarProjeto(client, 'proj-1');
    expect(update).toHaveBeenCalledWith({ ativo: true });

    const errClient = createMockSupabase({
      listError: { message: 'err' },
      insertError: { message: 'err' },
      updateError: { message: 'err' },
      deleteError: { message: 'err' },
      sessionsError: { message: 'err' },
    }).client;

    await expect(
      createProjeto(errClient, { nome: 'Teste' }),
    ).rejects.toThrow(/Não foi possível cadastrar o projeto/);
    await expect(
      updateProjeto(errClient, 'proj-1', { nome: 'Teste' }),
    ).rejects.toThrow(/Não foi possível atualizar o projeto/);
    await expect(inativarProjeto(errClient, 'proj-1')).rejects.toThrow(
      /Não foi possível verificar sessões abertas/,
    );
    await expect(reativarProjeto(errClient, 'proj-1')).rejects.toThrow(
      /Não foi possível reativar o projeto/,
    );

    const updateErrOnly = createMockSupabase({
      updateError: { message: 'err' },
    }).client;
    await expect(inativarProjeto(updateErrOnly, 'proj-1')).rejects.toThrow(
      /Não foi possível inativar o projeto/,
    );

    const delErrOnly = createMockSupabase({
      deleteError: { message: 'err' },
    }).client;
    await expect(excluirProjeto(delErrOnly, 'proj-1')).rejects.toThrow(
      /Não foi possível excluir o projeto/,
    );

    const arrSession = createMockSupabase({
      openSessions: [{ id: 'r1', usuarios: [{ nome: 'Ana' }] }],
    }).client;
    await expect(inativarProjeto(arrSession, 'proj-1')).rejects.toThrow(/Ana/);
  });
});

describe('ProjetosPage', () => {
  it('exibe estado vazio e permite abrir modal e validar formulário', async () => {
    const user = userEvent.setup();
    const { client } = createMockSupabase({ projetos: [] });

    render(
      <ToastProvider>
        <ProjetosPage supabaseClient={client} />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Nenhum projeto encontrado'),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: 'Criar primeiro projeto' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Novo Projeto' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      screen.getByText('O nome do projeto é obrigatório.'),
    ).toBeInTheDocument();
  });

  it('lista, filtra, cria, edita, inativa e exclui projetos', async () => {
    const user = userEvent.setup();
    const { client, insert, update, del } = createMockSupabase({
      projetos: [
        baseProjeto,
        {
          ...baseProjeto,
          id: 'proj-2',
          nome: 'Projeto Inativo',
          descricao: null,
          ativo: false,
          registros_ponto: [{ count: 3 }],
        },
      ],
    });

    render(
      <ToastProvider>
        <ProjetosPage supabaseClient={client} />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cliente Alpha')).toBeInTheDocument();
    });
    expect(screen.getByText('Projeto Inativo')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'ativos');
    expect(screen.queryByText('Projeto Inativo')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'todos');
    await user.type(screen.getByLabelText('Buscar'), 'Inativo');
    expect(screen.queryByText('Cliente Alpha')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Buscar'));

    // Criar novo projeto
    await user.click(screen.getByRole('button', { name: 'Novo Projeto' }));
    await user.type(screen.getByLabelText('Nome do projeto'), 'Projeto Beta');
    await user.type(screen.getByLabelText('Descrição'), 'Nova frente');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(insert).toHaveBeenCalledWith({
      nome: 'Projeto Beta',
      descricao: 'Nova frente',
    });

    // Editar projeto
    const editButtons = screen.getAllByRole('button', { name: 'Editar' });
    await user.click(editButtons[0]!);
    expect(
      screen.getByRole('dialog', { name: 'Editar Projeto' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(update).toHaveBeenCalled();

    // Inativar projeto ativo
    await user.click(screen.getByRole('button', { name: 'Inativar' }));
    await waitFor(() => {
      expect(screen.getByText('Projeto inativado.')).toBeInTheDocument();
    });

    // Excluir projeto sem registros_ponto
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(
      screen.getByRole('dialog', { name: 'Confirmar exclusão' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirmar exclusão' }),
    );
    expect(del).toHaveBeenCalled();

    // Reativar projeto inativo
    await user.click(screen.getByRole('button', { name: 'Reativar' }));
    await waitFor(() => {
      expect(screen.getByText('Projeto reativado.')).toBeInTheDocument();
    });

    // Filtro sem resultado e limpar filtros
    await user.type(screen.getByLabelText('Buscar'), 'inexistente-xyz');
    expect(screen.getByText('Nenhum projeto encontrado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByText('Cliente Alpha')).toBeInTheDocument();
  });

  it('exibe toasts de erro quando carregamento, salvamento, status ou exclusão falham', async () => {
    const user = userEvent.setup();
    const longDesc = 'A'.repeat(90);
    const { client } = createMockSupabase({
      projetos: [{ ...baseProjeto, descricao: longDesc }],
      insertError: { message: 'erro insert' },
      updateError: { message: 'erro update' },
      deleteError: { message: 'erro delete' },
    });

    render(
      <ToastProvider>
        <ProjetosPage supabaseClient={client} />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(`${'A'.repeat(77)}...`)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Novo Projeto' }));
    await user.type(screen.getByLabelText('Nome do projeto'), 'Falha');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      expect(
        screen.getByText('Não foi possível cadastrar o projeto.'),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    await user.click(screen.getByRole('button', { name: 'Inativar' }));
    await waitFor(() => {
      expect(
        screen.getByText('Não foi possível inativar o projeto.'),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar exclusão' }),
    );
    await waitFor(() => {
      expect(
        screen.getByText('Não foi possível excluir o projeto.'),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
  });

  it('exibe erro quando a listagem inicial falha', async () => {
    const { client } = createMockSupabase({
      listError: { message: 'erro list' },
    });

    render(
      <ToastProvider>
        <ProjetosPage supabaseClient={client} />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Não foi possível carregar os projetos.'),
      ).toBeInTheDocument();
    });
  });
});
