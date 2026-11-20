function parseIsoUtc(isoUtc: string): Date {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Timestamp ISO UTC inválido: "${isoUtc}"`);
  }
  return date;
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
