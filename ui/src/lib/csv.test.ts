import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCsvFilename,
  buildTimeEntriesCsv,
  downloadCsvFile,
  escapeCsvCell,
  formatDurationDecimalCsv,
  sanitizeCsvTextCell,
  slugifyFilenamePart,
} from './csv';

describe('csv utilities (UC-12)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitiza células de texto contra CSV Formula Injection', () => {
    expect(sanitizeCsvTextCell(null)).toBe('');
    expect(sanitizeCsvTextCell(undefined)).toBe('');
    expect(sanitizeCsvTextCell('Texto normal')).toBe('Texto normal');
    expect(sanitizeCsvTextCell("=CMD|'/C calc'!A0")).toBe("'=CMD|'/C calc'!A0");
    expect(sanitizeCsvTextCell('+1+1')).toBe("'+1+1");
    expect(sanitizeCsvTextCell('-2+3')).toBe("'-2+3");
    expect(sanitizeCsvTextCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    expect(sanitizeCsvTextCell('\tcmd')).toBe("'\tcmd");
    expect(sanitizeCsvTextCell('\rcmd')).toBe("'\rcmd");
  });

  it('aplica escape RFC 4180 para separador, aspas e quebras de linha', () => {
    expect(escapeCsvCell('simples')).toBe('simples');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell('a;b')).toBe('"a;b"');
    expect(escapeCsvCell('com "aspas"')).toBe('"com ""aspas"""');
    expect(escapeCsvCell('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
    expect(escapeCsvCell('linha 1\r\nlinha 2')).toBe('"linha 1\r\nlinha 2"');
  });

  it('formata duração decimal para CSV com vírgula e gera nomes de arquivo padronizados', () => {
    expect(formatDurationDecimalCsv(0)).toBe('0,00');
    expect(formatDurationDecimalCsv(9000)).toBe('2,50');
    expect(formatDurationDecimalCsv(-50)).toBe('0,00');

    expect(slugifyFilenamePart('João Álvares Jr.')).toBe('joao-alvares-jr');
    expect(
      buildCsvFilename({
        startDate: '2026-11-01',
        endDate: '2026-11-30',
      }),
    ).toBe('pontos_2026-11-01_a_2026-11-30.csv');
    expect(
      buildCsvFilename({
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        userName: 'Maria Silva',
      }),
    ).toBe('pontos_maria-silva_2026-11-01_a_2026-11-30.csv');
  });

  it('gera CSV UTF-8 com BOM, acentos, sessão em andamento e totalização sem colunas admin', () => {
    const csv = buildTimeEntriesCsv(
      [
        {
          usuarioNome: 'João Worker',
          usuarioEmail: 'joao@pontolele.com',
          projetoNome: 'Projeto Ação',
          horario_entrada: '2026-11-10T12:00:00.000Z',
          horario_saida: '2026-11-10T14:30:00.000Z',
          observacoes: 'Implementação com acentuação',
        },
        {
          usuarioNome: 'João Worker',
          usuarioEmail: 'joao@pontolele.com',
          projetoNome: 'Projeto Beta',
          horario_entrada: '2026-11-11T12:00:00.000Z',
          horario_saida: null,
          observacoes: null,
        },
      ],
      {
        includeAuditColumns: false,
        timeZone: 'America/Sao_Paulo',
      },
    );

    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      'Usuario;Email;Projeto;Data_Entrada;Hora_Entrada;Data_Saida;Hora_Saida;Duracao_HHMM;Duracao_Horas_Decimais;Observacoes',
    );
    expect(lines[1]).toBe(
      'João Worker;joao@pontolele.com;Projeto Ação;10/11/2026;09:00:00;10/11/2026;11:30:00;02:30;2,50;Implementação com acentuação',
    );
    expect(lines[2]).toBe(
      'João Worker;joao@pontolele.com;Projeto Beta;11/11/2026;09:00:00;;Em andamento;;;',
    );
    expect(lines[3]).toBe('TOTAL;;;;;;;02:30;2,50;');
  });

  it('gera CSV na visão admin com colunas de auditoria e proteção contra CSV Injection', () => {
    const csv = buildTimeEntriesCsv(
      [
        {
          usuarioNome: '=Maria',
          projetoNome: 'Projeto; "Core"',
          horario_entrada: '2026-11-10T12:00:00.000Z',
          horario_saida: '2026-11-10T13:00:00.000Z',
          observacoes: '=CMD|\'/C calc\'!A0; linha 1\n"linha 2"',
          atualizado_por_nome: '+Carlos Admin',
          atualizado_em: '2026-11-10T15:00:00.000Z',
        },
        {
          usuarioNome: 'Pedro',
          projetoNome: 'Projeto B',
          horario_entrada: '2026-11-10T14:00:00.000Z',
          horario_saida: '2026-11-10T15:30:00.000Z',
          observacoes: 'Sem edição',
          atualizado_por_nome: null,
          atualizado_em: null,
        },
      ],
      {
        includeAuditColumns: true,
        timeZone: 'America/Sao_Paulo',
      },
    );

    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      'Usuario;Projeto;Data_Entrada;Hora_Entrada;Data_Saida;Hora_Saida;Duracao_HHMM;Duracao_Horas_Decimais;Observacoes;Editado_Por;Editado_Em',
    );
    expect(csv).toContain("'=Maria");
    expect(csv).toContain('"Projeto; ""Core"""');
    expect(csv).toContain("\"'=CMD|'/C calc'!A0; linha 1\n\"\"linha 2\"\"\"");
    expect(csv).toContain("'+Carlos Admin;10/11/2026 12:00:00");
    expect(lines[lines.length - 1]).toBe('TOTAL;;;;;;02:30;2,50;;;');
  });

  it('dispara download via Blob e libera ObjectURL com revokeObjectURL', () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    downloadCsvFile('\uFEFFUsuario\r\nMaria', 'pontos_2026-11-01_a_2026-11-30.csv');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = (createObjectURL.mock.calls[0] as unknown[])[0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
