import {
  calculateDurationSeconds,
  formatDurationHM,
  formatUtcToLocalDate,
  formatUtcToLocalDateTime,
  formatUtcToLocalTime,
  sumClosedSessionsDurationSeconds,
} from './dateTime';

const UTF8_BOM = '\uFEFF';
const CSV_SEPARATOR = ';';
const CSV_LINE_BREAK = '\r\n';
const FORMULA_INJECTION_PREFIX_RE = /^[=+\-@\t\r]/;

export interface CsvTimeEntryRow {
  usuarioNome: string;
  usuarioEmail?: string | null;
  projetoNome: string;
  horario_entrada: string;
  horario_saida: string | null;
  observacoes: string | null;
  atualizado_por_nome?: string | null;
  atualizado_em?: string | null;
}

export interface BuildTimeEntriesCsvOptions {
  includeAuditColumns?: boolean;
  includeEmailColumn?: boolean;
  timeZone?: string;
}

export interface BuildCsvFilenameOptions {
  startDate: string;
  endDate: string;
  userName?: string | null;
}

export function sanitizeCsvTextCell(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  if (FORMULA_INJECTION_PREFIX_RE.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function escapeCsvCell(value: string | null | undefined): string {
  const text = value ?? '';
  const mustQuote =
    text.includes(CSV_SEPARATOR) ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r');

  if (!mustQuote) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export function formatDurationDecimalCsv(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  return (safeSeconds / 3600).toFixed(2).replace('.', ',');
}

export function slugifyFilenamePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildCsvFilename({
  startDate,
  endDate,
  userName,
}: BuildCsvFilenameOptions): string {
  const slug = userName ? slugifyFilenamePart(userName) : '';
  if (slug) {
    return `pontos_${slug}_${startDate}_a_${endDate}.csv`;
  }
  return `pontos_${startDate}_a_${endDate}.csv`;
}

export function buildTimeEntriesCsv(
  rows: CsvTimeEntryRow[],
  options: BuildTimeEntriesCsvOptions = {},
): string {
  const includeAuditColumns = options.includeAuditColumns ?? false;
  const includeEmailColumn =
    options.includeEmailColumn ??
    rows.some((row) => Boolean(row.usuarioEmail?.trim()));
  const { timeZone } = options;

  const headers: string[] = ['Usuario'];
  if (includeEmailColumn) {
    headers.push('Email');
  }
  headers.push(
    'Projeto',
    'Data_Entrada',
    'Hora_Entrada',
    'Data_Saida',
    'Hora_Saida',
    'Duracao_HHMM',
    'Duracao_Horas_Decimais',
    'Observacoes',
  );
  if (includeAuditColumns) {
    headers.push('Editado_Por', 'Editado_Em');
  }

  const lines: string[] = [headers.map((cell) => escapeCsvCell(cell)).join(CSV_SEPARATOR)];

  for (const row of rows) {
    const isOngoing = row.horario_saida === null;
    const durationSeconds = isOngoing
      ? null
      : calculateDurationSeconds(row.horario_entrada, row.horario_saida);

    const cells: string[] = [escapeCsvCell(sanitizeCsvTextCell(row.usuarioNome))];
    if (includeEmailColumn) {
      cells.push(escapeCsvCell(sanitizeCsvTextCell(row.usuarioEmail ?? '')));
    }

    cells.push(
      escapeCsvCell(sanitizeCsvTextCell(row.projetoNome)),
      escapeCsvCell(formatUtcToLocalDate(row.horario_entrada, timeZone)),
      escapeCsvCell(formatUtcToLocalTime(row.horario_entrada, timeZone)),
      escapeCsvCell(
        row.horario_saida
          ? formatUtcToLocalDate(row.horario_saida, timeZone)
          : '',
      ),
      escapeCsvCell(
        row.horario_saida
          ? formatUtcToLocalTime(row.horario_saida, timeZone)
          : 'Em andamento',
      ),
      escapeCsvCell(
        durationSeconds !== null ? formatDurationHM(durationSeconds) : '',
      ),
      escapeCsvCell(
        durationSeconds !== null
          ? formatDurationDecimalCsv(durationSeconds)
          : '',
      ),
      escapeCsvCell(sanitizeCsvTextCell(row.observacoes)),
    );

    if (includeAuditColumns) {
      cells.push(
        escapeCsvCell(sanitizeCsvTextCell(row.atualizado_por_nome)),
        escapeCsvCell(
          row.atualizado_em
            ? formatUtcToLocalDateTime(row.atualizado_em, timeZone)
            : '',
        ),
      );
    }

    lines.push(cells.join(CSV_SEPARATOR));
  }

  const totalClosedSeconds = sumClosedSessionsDurationSeconds(rows);
  const totalCells: string[] = ['TOTAL'];
  if (includeEmailColumn) {
    totalCells.push('');
  }
  totalCells.push(
    '',
    '',
    '',
    '',
    '',
    escapeCsvCell(formatDurationHM(totalClosedSeconds)),
    escapeCsvCell(formatDurationDecimalCsv(totalClosedSeconds)),
    '',
  );
  if (includeAuditColumns) {
    totalCells.push('', '');
  }

  lines.push(totalCells.join(CSV_SEPARATOR));

  return `${UTF8_BOM}${lines.join(CSV_LINE_BREAK)}`;
}

export function downloadCsvFile(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}
