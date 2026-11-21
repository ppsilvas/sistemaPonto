import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchRelatorioPontos,
  listRelatorioFilterOptions,
  summarizeRelatorioRegistros,
  type RegistroPontoRelatorio,
  type RelatorioFiltros,
} from './relatoriosService';

function createMockQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: { data: unknown; error: unknown }) => void) =>
      Promise.resolve(result).then(resolve),
  };
  return builder;
}

describe('relatoriosService', () => {
  const baseFiltros: RelatorioFiltros = {
    usuarioId: 'todos',
    projetoId: 'todos',
    dataInicial: '2026-11-01',
    dataFinal: '2026-11-30',
    status: 'todos',
    incluirExcluidos: false,
  };

  it('carrega opções de filtros com usuários e projetos (incluindo inativos)', async () => {
    const usuariosBuilder = createMockQueryBuilder({
      data: [
        { id: 'u1', nome: 'Ana', ativo: true },
        { id: 'u2', nome: 'Carlos', ativo: false },
      ],
      error: null,
    });
    const projetosBuilder = createMockQueryBuilder({
      data: [
        { id: 'p1', nome: 'Projeto Alpha', ativo: true },
        { id: 'p2', nome: 'Projeto Legado', ativo: false },
      ],
      error: null,
    });

    const client = {
      from: vi.fn((table: string) =>
        table === 'usuarios' ? usuariosBuilder : projetosBuilder,
      ),
    } as unknown as SupabaseClient;

    const options = await listRelatorioFilterOptions(client);
    expect(options.usuarios).toHaveLength(2);
    expect(options.projetos).toHaveLength(2);
    expect(options.usuarios[1]?.ativo).toBe(false);
    expect(options.projetos[1]?.ativo).toBe(false);
  });

  it('lança erro ao falhar ao carregar opções de filtro', async () => {
    const client = {
      from: vi.fn(() =>
        createMockQueryBuilder({ data: null, error: { message: 'boom' } }),
      ),
    } as unknown as SupabaseClient;

    await expect(listRelatorioFilterOptions(client)).rejects.toThrow(
      /Não foi possível carregar a lista de usuários/,
    );
  });

  it('bloqueia consulta quando dataInicial > dataFinal', async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(
      fetchRelatorioPontos(client, {
        ...baseFiltros,
        dataInicial: '2026-11-20',
        dataFinal: '2026-11-10',
      }),
    ).rejects.toThrow(/data inicial não pode ser maior/i);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('aplica filtros combinados, resolve nomes de auditoria e calcula resumo exato sem incluir excluídos', async () => {
    const rows = [
      {
        id: 'r1',
        usuario_id: 'u1',
        projeto_id: 'p1',
        horario_entrada: '2026-11-10T10:00:00.000Z',
        horario_saida: '2026-11-10T12:30:00.000Z',
        observacoes: 'Entrega módulo A',
        atualizado_em: '2026-11-10T13:00:00.000Z',
        atualizado_por: 'u-admin',
        excluido_em: null,
        excluido_por: null,
        usuarios: { id: 'u1', nome: 'Maria', ativo: true },
        projetos: { id: 'p1', nome: 'Projeto Beta', ativo: true },
      },
      {
        id: 'r2',
        usuario_id: 'u1',
        projeto_id: 'p1',
        horario_entrada: '2026-11-11T08:00:00.000Z',
        horario_saida: null,
        observacoes: null,
        atualizado_em: null,
        atualizado_por: null,
        excluido_em: null,
        excluido_por: null,
        usuarios: { id: 'u1', nome: 'Maria', ativo: true },
        projetos: { id: 'p1', nome: 'Projeto Beta', ativo: true },
      },
      {
        id: 'r3',
        usuario_id: 'u1',
        projeto_id: 'p1',
        horario_entrada: '2026-11-09T09:00:00.000Z',
        horario_saida: '2026-11-09T11:00:00.000Z',
        observacoes: 'Duplicado',
        atualizado_em: null,
        atualizado_por: null,
        excluido_em: '2026-11-09T12:00:00.000Z',
        excluido_por: 'u-admin',
        usuarios: { id: 'u1', nome: 'Maria', ativo: true },
        projetos: { id: 'p1', nome: 'Projeto Beta', ativo: true },
      },
    ];

    const registrosBuilder = createMockQueryBuilder({ data: rows, error: null });
    const adminsBuilder = createMockQueryBuilder({
      data: [{ id: 'u-admin', nome: 'Pedro Admin' }],
      error: null,
    });

    const client = {
      from: vi.fn((table: string) =>
        table === 'registros_ponto' ? registrosBuilder : adminsBuilder,
      ),
    } as unknown as SupabaseClient;

    const nowMs = new Date('2026-11-11T21:00:00.000Z').getTime(); // 13h após 08:00
    const result = await fetchRelatorioPontos(
      client,
      {
        ...baseFiltros,
        usuarioId: 'u1',
        projetoId: 'p1',
        incluirExcluidos: true,
      },
      { nowMs },
    );

    expect(registrosBuilder.eq).toHaveBeenCalledWith('usuario_id', 'u1');
    expect(registrosBuilder.eq).toHaveBeenCalledWith('projeto_id', 'p1');
    expect(registrosBuilder.is).not.toHaveBeenCalledWith('excluido_em', null);

    expect(result.registros).toHaveLength(3);
    expect(result.registros[0]?.atualizado_por_nome).toBe('Pedro Admin');
    expect(result.registros[1]?.em_andamento).toBe(true);
    expect(result.registros[1]?.alerta_longa_duracao).toBe(true);
    expect(result.registros[2]?.excluido).toBe(true);
    expect(result.registros[2]?.excluido_por_nome).toBe('Pedro Admin');

    // Apenas r1 (2h30 = 9000s) entra no total de horas; r2 em andamento; r3 excluído não entra!
    expect(result.resumo.total_segundos).toBe(9000);
    expect(result.resumo.total_registros).toBe(3);
    expect(result.resumo.sessoes_em_andamento).toBe(1);
    expect(result.resumo.horas_por_projeto).toEqual([
      {
        id: 'p1',
        nome: 'Projeto Beta',
        ativo: true,
        total_segundos: 9000,
        quantidade_sessoes: 1,
      },
    ]);
    expect(result.resumo.horas_por_usuario).toEqual([
      {
        id: 'u1',
        nome: 'Maria',
        ativo: true,
        total_segundos: 9000,
        quantidade_sessoes: 1,
      },
    ]);
  });

  it('aplica filtros de status corretamente na query', async () => {
    const makeClient = () => {
      const builder = createMockQueryBuilder({ data: [], error: null });
      const client = {
        from: vi.fn(() => builder),
      } as unknown as SupabaseClient;
      return { client, builder };
    };

    const s1 = makeClient();
    await fetchRelatorioPontos(s1.client, { ...baseFiltros, status: 'em_andamento' });
    expect(s1.builder.is).toHaveBeenCalledWith('horario_saida', null);
    expect(s1.builder.is).toHaveBeenCalledWith('excluido_em', null);

    const s2 = makeClient();
    await fetchRelatorioPontos(s2.client, { ...baseFiltros, status: 'encerrados' });
    expect(s2.builder.not).toHaveBeenCalledWith('horario_saida', 'is', null);

    const s3 = makeClient();
    await fetchRelatorioPontos(s3.client, { ...baseFiltros, status: 'editados' });
    expect(s3.builder.not).toHaveBeenCalledWith('atualizado_em', 'is', null);
  });

  it('ordena resumos agrupados por maior duração e depois alfabeticamente', () => {
    const base: Omit<
      RegistroPontoRelatorio,
      'id' | 'usuario_id' | 'usuario_nome' | 'projeto_id' | 'projeto_nome' | 'duracao_segundos'
    > = {
      usuario_ativo: true,
      projeto_ativo: true,
      horario_entrada: '2026-11-10T10:00:00.000Z',
      horario_saida: '2026-11-10T11:00:00.000Z',
      observacoes: null,
      atualizado_em: null,
      atualizado_por: null,
      atualizado_por_nome: null,
      excluido_em: null,
      excluido_por: null,
      excluido_por_nome: null,
      em_andamento: false,
      excluido: false,
      alerta_longa_duracao: false,
    };

    const resumo = summarizeRelatorioRegistros([
      {
        ...base,
        id: '1',
        usuario_id: 'u2',
        usuario_nome: 'Bruno',
        projeto_id: 'p2',
        projeto_nome: 'Beta',
        duracao_segundos: 3600,
      },
      {
        ...base,
        id: '2',
        usuario_id: 'u1',
        usuario_nome: 'Ana',
        projeto_id: 'p1',
        projeto_nome: 'Alpha',
        duracao_segundos: 3600,
      },
      {
        ...base,
        id: '3',
        usuario_id: 'u3',
        usuario_nome: 'Carla',
        projeto_id: 'p3',
        projeto_nome: 'Gamma',
        duracao_segundos: 7200,
      },
    ]);

    expect(resumo.horas_por_projeto.map((p) => p.nome)).toEqual([
      'Gamma',
      'Alpha',
      'Beta',
    ]);
    expect(resumo.horas_por_usuario.map((u) => u.nome)).toEqual([
      'Carla',
      'Ana',
      'Bruno',
    ]);
  });
});
