export type PeriodPreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month';

export interface LocalDateRange {
  startDate: string;
  endDate: string;
}

function parseIsoUtc(isoUtc: string): Date {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Timestamp ISO UTC inválido: "${isoUtc}"`);
  }
  return date;
}

function parseLocalDateParts(localDateStr: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDateStr);
  if (!match) {
    throw new Error(`Data local inválida (esperado YYYY-MM-DD): "${localDateStr}"`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);

  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    throw new Error(`Data local inexistente: "${localDateStr}"`);
  }

  return { year, month, day };
}

export function formatLocalDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = padTwo(date.getMonth() + 1);
  const day = padTwo(date.getDate());
  return `${year}-${month}-${day}`;
}

export function startOfLocalDayToUtcIso(localDateStr: string): string {
  const { year, month, day } = parseLocalDateParts(localDateStr);
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

export function endOfLocalDayToUtcIso(localDateStr: string): string {
  const { year, month, day } = parseLocalDateParts(localDateStr);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

export function getLocalDateRangeForPreset(
  preset: PeriodPreset,
  referenceDate: Date = new Date(),
): LocalDateRange {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const day = referenceDate.getDate();

  switch (preset) {
    case 'today': {
      const formatted = formatLocalDateInput(new Date(year, month, day));
      return { startDate: formatted, endDate: formatted };
    }
    case 'this_week': {
      const current = new Date(year, month, day);
      const dayOfWeek = current.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(year, month, day + diffToMonday);
      const sunday = new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + 6,
      );
      return {
        startDate: formatLocalDateInput(monday),
        endDate: formatLocalDateInput(sunday),
      };
    }
    case 'this_month': {
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      return {
        startDate: formatLocalDateInput(firstDay),
        endDate: formatLocalDateInput(lastDay),
      };
    }
    case 'last_month': {
      const firstDay = new Date(year, month - 1, 1);
      const lastDay = new Date(year, month, 0);
      return {
        startDate: formatLocalDateInput(firstDay),
        endDate: formatLocalDateInput(lastDay),
      };
    }
  }
}

export function formatUtcToLocalDate(
  isoUtc: string,
  timeZone?: string,
): string {
  const date = parseIsoUtc(isoUtc);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatUtcToLocalTime(
  isoUtc: string,
  timeZone?: string,
): string {
  const date = parseIsoUtc(isoUtc);
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatUtcToLocalDateTime(
  isoUtc: string,
  timeZone?: string,
): string {
  return `${formatUtcToLocalDate(isoUtc, timeZone)} ${formatUtcToLocalTime(isoUtc, timeZone)}`;
}

export function calculateDurationSeconds(
  startIsoUtc: string,
  endIsoUtc: string | null,
  nowMs: number = Date.now(),
): number {
  const startMs = parseIsoUtc(startIsoUtc).getTime();
  const endMs = endIsoUtc ? parseIsoUtc(endIsoUtc).getTime() : nowMs;
  const diffSeconds = Math.floor((endMs - startMs) / 1000);
  return Math.max(0, diffSeconds);
}

function padTwo(value: number): string {
  return String(Math.floor(value)).padStart(2, '0');
}

export function formatDurationHMS(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${padTwo(hours)}:${padTwo(minutes)}:${padTwo(seconds)}`;
}

export function formatDurationHM(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${padTwo(hours)}:${padTwo(minutes)}`;
}

export function formatDurationHuman(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${padTwo(hours)}h ${padTwo(minutes)}m`;
}

export function formatDurationDecimalHours(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const decimalHours = safeSeconds / 3600;
  return `${decimalHours.toFixed(2).replace('.', ',')}h`;
}

export function sumClosedSessionsDurationSeconds(
  sessions: Array<{ horario_entrada: string; horario_saida: string | null }>,
): number {
  return sessions.reduce((acc, session) => {
    if (!session.horario_saida) {
      return acc;
    }
    return acc + calculateDurationSeconds(session.horario_entrada, session.horario_saida);
  }, 0);
}
