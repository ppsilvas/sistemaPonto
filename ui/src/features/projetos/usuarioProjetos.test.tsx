import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ToastContext';
import { GerenciarEquipeModal } from './GerenciarEquipeModal';
import { ProjetosPage } from './ProjetosPage';
import {
  desvincularUsuarioDoProjeto,
  listUsuariosAtivosElegiveis,
  listVinculosProjeto,
  syncProjetosDoUsuario,
  vincularUsuariosAoProjeto,
} from './usuarioProjetosService';

function createServiceMock({
  vinculosData = [
    {
      usuario_id: 'u-1',
      usuarios: {
        id: 'u-1',
        nome: 'Carlos Silva',
        email: 'carlos@empresa.com',
        ativo: true,
        perfis: { nome: 'worker' },
      },
    },
    {
      usuario_id: 'u-2',
      usuarios: [
        {
          id: 'u-2',
          nome: 'Ana Admin',
          email: 'ana@empresa.com',
          ativo: true,
          perfis: [{ nome: 'admin' }],
        },
      ],
    },
    {
      usuario_id: 'u-null',
      usuarios: null,
    },
  ],
  elegiveisData = [
    {
      id: 'u-1',
      nome: 'Carlos Silva',
      email: 'carlos@empresa.com',
      perfis: { nome: 'worker' },
    },
    {
      id: 'u-3',
      nome: 'Bruno Costa',
      email: 'bruno@empresa.com',
      perfis: [{ nome: 'worker' }],
    },
  ],
  openSessions = [] as Array<{ id: string }>,
  vinculosError = null as { message: string } | null,
  elegiveisError = null as { message: string } | null,
  upsertError = null as { message: string } | null,
  deleteError = null as { message: string } | null,
  sessionError = null as { message: string } | null,
} = {}) {
  const upEq = vi.fn().mockResolvedValue({
    data: vinculosError ? null : vinculosData,
    error: vinculosError,
  });
  const upSelect = vi.fn().mockReturnValue({ eq: upEq });
  const upUpsert = vi.fn().mockResolvedValue({ error: upsertError });
  const upDeleteEq2 = vi.fn().mockResolvedValue({ error: deleteError });
  const upDeleteEq1 = vi.fn().mockReturnValue({ eq: upDeleteEq2 });
  const upDelete = vi.fn().mockReturnValue({ eq: upDeleteEq1 });

  const uOrder = vi.fn().mockResolvedValue({
    data: elegiveisError ? null : elegiveisData,
    error: elegiveisError,
  });
  const uEq = vi.fn().mockReturnValue({ order: uOrder });
  const uSelect = vi.fn().mockReturnValue({ eq: uEq });

  const rpLimit = vi.fn().mockResolvedValue({
    data: sessionError ? null : openSessions,
    error: sessionError,
  });
  const rpIs2 = vi.fn().mockReturnValue({ limit: rpLimit });
  const rpIs1 = vi.fn().mockReturnValue({ is: rpIs2 });
  const rpEq2 = vi.fn().mockReturnValue({ is: rpIs1 });
  const rpEq1 = vi.fn().mockReturnValue({ eq: rpEq2 });
  const rpSelect = vi.fn().mockReturnValue({ eq: rpEq1 });

  const projetosOrder = vi.fn().mockResolvedValue({
    data: [
      {
        id: 'proj-1',
        nome: 'Projeto Alpha',
        descricao: 'Projeto principal',
        ativo: true,
        inativado_em: null,
        criado_em: '2026-11-20T12:00:00.000Z',
        usuario_projetos: [{ count: 2 }],
        registros_ponto: [{ count: 1 }],
      },
    ],
    error: null,
  });
  const projetosSelect = vi.fn().mockReturnValue({ order: projetosOrder });

  const from = vi.fn((table: string) => {
    if (table === 'usuario_projetos') {
      return {
        select: upSelect,
        upsert: upUpsert,
        delete: upDelete,
      };
    }
    if (table === 'usuarios') {
      return { select: uSelect };
    }
    if (table === 'registros_ponto') {
      return { select: rpSelect };
    }
    return { select: projetosSelect };
  });

  return {
    client: { from } as unknown as SupabaseClient,
    upUpsert,
    upDelete,
  };
}

describe('usuarioProjetosService', () => {
  it('lista vínculos ordenados e usuários elegíveis', async () => {
    const { client } = createServiceMock();

    const vinculos = await listVinculosProjeto(client, 'proj-1');
    expect(vinculos).toHaveLength(2);
    expect(vinculos[0]?.nome).toBe('Ana Admin');
    expect(vinculos[1]?.nome).toBe('Carlos Silva');

    const elegiveis = await listUsuariosAtivosElegiveis(client);
    expect(elegiveis).toHaveLength(2);
    expect(elegiveis[1]?.perfil).toBe('worker');

    const { client: fallbackClient } = createServiceMock({
      vinculosData: [
        {
          usuario_id: 'u-9',
          usuarios: {
            id: 'u-9',
            nome: 'Sem Perfil',
            email: 'sem@empresa.com',
            ativo: true,
            perfis: null as unknown as { nome: string },
          },
        },
      ],
      elegiveisData: [
        {
          id: 'u-9',
          nome: 'Sem Perfil',
          email: 'sem@empresa.com',
          perfis: [] as unknown as { nome: 'worker' },
        },
      ],
    });
    const fallbackVinculos = await listVinculosProjeto(fallbackClient, 'proj-1');
    expect(fallbackVinculos[0]?.perfil).toBe('worker');
    const fallbackElegiveis = await listUsuariosAtivosElegiveis(fallbackClient);
    expect(fallbackElegiveis[0]?.perfil).toBe('worker');
  });

  it('lança erro quando consultas falham', async () => {
    const { client } = createServiceMock({
      vinculosError: { message: 'fail' },
      elegiveisError: { message: 'fail' },
    });

    await expect(listVinculosProjeto(client, 'proj-1')).rejects.toThrow(
      /Não foi possível carregar os usuários vinculados/,
    );
    await expect(listUsuariosAtivosElegiveis(client)).rejects.toThrow(
      /Não foi possível carregar os usuários ativos/,
    );
  });

  it('vincula usuários com idempotência e ignora lista vazia', async () => {
    const { client, upUpsert } = createServiceMock();

    await vincularUsuariosAoProjeto(client, 'proj-1', []);
    expect(upUpsert).not.toHaveBeenCalled();

    await vincularUsuariosAoProjeto(client, 'proj-1', ['u-3', 'u-3']);
    expect(upUpsert).toHaveBeenCalledWith(
      [{ usuario_id: 'u-3', projeto_id: 'proj-1' }],
      { onConflict: 'usuario_id,projeto_id', ignoreDuplicates: true },
    );

    const { client: errClient } = createServiceMock({
      upsertError: { message: 'rls' },
    });
    await expect(
      vincularUsuariosAoProjeto(errClient, 'proj-1', ['u-3']),
    ).rejects.toThrow(/Não foi possível vincular os usuários/);
  });

  it('bloqueia desvinculação quando há ponto em aberto (FE01) e permite quando livre', async () => {
    const { client: blockedClient } = createServiceMock({
      openSessions: [{ id: 'reg-1' }],
    });
    await expect(
      desvincularUsuarioDoProjeto(blockedClient, 'u-1', 'proj-1'),
    ).rejects.toThrow(/ponto em aberto neste projeto/);

    const { client: sessErrClient } = createServiceMock({
      sessionError: { message: 'err' },
    });
    await expect(
      desvincularUsuarioDoProjeto(sessErrClient, 'u-1', 'proj-1'),
    ).rejects.toThrow(/Não foi possível verificar sessão em aberto/);

    const { client: delErrClient } = createServiceMock({
      deleteError: { message: 'err' },
    });
    await expect(
      desvincularUsuarioDoProjeto(delErrClient, 'u-1', 'proj-1'),
    ).rejects.toThrow(/Não foi possível desvincular o usuário/);

    const { client: okClient, upDelete } = createServiceMock();
    await desvincularUsuarioDoProjeto(okClient, 'u-1', 'proj-1');
    expect(upDelete).toHaveBeenCalledTimes(1);
  });

  it('sincroniza projetos do usuário adicionando e removendo vínculos', async () => {
    const { client, upUpsert, upDelete } = createServiceMock();
    await syncProjetosDoUsuario(client, 'u-1', ['proj-1'], ['proj-2']);
    expect(upDelete).toHaveBeenCalledTimes(1);
    expect(upUpsert).toHaveBeenCalledWith(
      [{ usuario_id: 'u-1', projeto_id: 'proj-2' }],
      { onConflict: 'usuario_id,projeto_id', ignoreDuplicates: true },
    );

    const { client: errClient } = createServiceMock({
      upsertError: { message: 'err' },
    });
    await expect(
      syncProjetosDoUsuario(errClient, 'u-1', [], ['proj-2']),
    ).rejects.toThrow(/Não foi possível atualizar os vínculos de projetos/);
  });
});

describe('GerenciarEquipeModal e integração em ProjetosPage', () => {
  it('abre modal pela ProjetosPage, filtra disponíveis, vincula e desvincula usuários', async () => {
    const user = userEvent.setup();
    const { client, upUpsert, upDelete } = createServiceMock();

    render(
      <ToastProvider>
        <ProjetosPage supabaseClient={client} />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Projeto Alpha')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Gerenciar Equipe' }));

    await waitFor(() => {
      expect(
        screen.getByText(/Gerenciar Equipe — Projeto Alpha/),
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Ana Admin')).toBeInTheDocument();
    expect(screen.getByText('Carlos Silva')).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Buscar usuário disponível');
    await user.type(searchInput, 'sem-match');
    expect(
      screen.getByText('Nenhum usuário ativo disponível para vínculo.'),
    ).toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, 'bruno@empresa.com');
    const checkbox = screen.getByRole('checkbox', { name: /Bruno Costa/ });
    await user.click(checkbox);
    await user.click(checkbox);
    await user.click(checkbox);
    await user.click(
      screen.getByRole('button', { name: 'Vincular selecionados' }),
    );

    await waitFor(() => {
      expect(upUpsert).toHaveBeenCalled();
    });
    expect(
      screen.getByText('Usuário(s) vinculado(s) ao projeto.'),
    ).toBeInTheDocument();

    const unlinkButtons = screen.getAllByRole('button', {
      name: 'Desvincular',
    });
    await user.click(unlinkButtons[0]!);

    await waitFor(() => {
      expect(upDelete).toHaveBeenCalled();
    });
    expect(
      screen.getByText(/desvinculado\(a\) do projeto/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => {
      expect(
        screen.queryByText(/Gerenciar Equipe — Projeto Alpha/),
      ).not.toBeInTheDocument();
    });
  });

  it('exibe erro ao falhar vínculo e renderiza usuário inativo vinculado', async () => {
    const user = userEvent.setup();
    const { client } = createServiceMock({
      vinculosData: [
        {
          usuario_id: 'u-1',
          usuarios: {
            id: 'u-1',
            nome: 'Carlos Inativo',
            email: 'carlos@empresa.com',
            ativo: false,
            perfis: { nome: 'worker' },
          },
        },
      ],
      upsertError: { message: 'rls' },
    });

    render(
      <ToastProvider>
        <GerenciarEquipeModal
          isOpen
          projeto={{
            id: 'proj-1',
            nome: 'Projeto Alpha',
            descricao: null,
            ativo: true,
            inativado_em: null,
            criado_em: '2026-11-20T12:00:00.000Z',
            usuarios_vinculados_count: 1,
            registros_count: 0,
          }}
          supabaseClient={client}
          onClose={vi.fn()}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Carlos Inativo')).toBeInTheDocument();
    });
    expect(screen.getByText('Inativo')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Bruno Costa/ }));
    await user.click(
      screen.getByRole('button', { name: 'Vincular selecionados' }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Não foi possível vincular os usuários ao projeto/),
      ).toBeInTheDocument();
    });
  });

  it('bloqueia vínculo em projeto inativo (FE03) e exibe erro ao desvincular com ponto aberto (FE01)', async () => {
    const user = userEvent.setup();
    const { client } = createServiceMock({
      openSessions: [{ id: 'reg-1' }],
    });

    const { rerender } = render(
      <ToastProvider>
        <GerenciarEquipeModal
          isOpen
          projeto={{
            id: 'proj-1',
            nome: 'Projeto Inativo',
            descricao: null,
            ativo: false,
            inativado_em: '2026-11-20T12:00:00.000Z',
            criado_em: '2026-11-20T12:00:00.000Z',
            usuarios_vinculados_count: 2,
            registros_count: 1,
          }}
          supabaseClient={client}
          onClose={vi.fn()}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Este projeto está inativo/),
      ).toBeInTheDocument();
    });

    const unlinkButtons = screen.getAllByRole('button', {
      name: 'Desvincular',
    });
    await user.click(unlinkButtons[0]!);

    await waitFor(() => {
      expect(
        screen.getByText(/ponto em aberto neste projeto/),
      ).toBeInTheDocument();
    });

    const { client: emptyErrClient } = createServiceMock({
      vinculosError: { message: 'erro' },
    });
    rerender(
      <ToastProvider>
        <GerenciarEquipeModal
          isOpen
          projeto={{
            id: 'proj-2',
            nome: 'Projeto Erro',
            descricao: null,
            ativo: true,
            inativado_em: null,
            criado_em: '2026-11-20T12:00:00.000Z',
            usuarios_vinculados_count: 0,
            registros_count: 0,
          }}
          supabaseClient={emptyErrClient}
          onClose={vi.fn()}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Não foi possível carregar os usuários vinculados/),
      ).toBeInTheDocument();
    });

    rerender(
      <ToastProvider>
        <GerenciarEquipeModal
          isOpen
          projeto={null}
          supabaseClient={emptyErrClient}
          onClose={vi.fn()}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    );
    expect(screen.getByText('Gerenciar Equipe')).toBeInTheDocument();
  });
});
