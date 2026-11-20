import { describe, expect, it } from 'vitest';
import {
  calculateDurationSeconds,
  formatDurationHM,
  formatDurationHMS,
  formatUtcToLocalDate,
  formatUtcToLocalDateTime,
  formatUtcToLocalTime,
} from './dateTime';

describe('dateTime utils', () => {
  const isoUtc = '2026-11-20T15:30:45.000Z';

  it('converte timestamp ISO UTC para data, hora e data/hora no fuso especificado', () => {
    expect(formatUtcToLocalDate(isoUtc, 'America/Sao_Paulo')).toBe(
      '20/11/2026',
    );
    expect(formatUtcToLocalTime(isoUtc, 'America/Sao_Paulo')).toBe(
      '12:30:45',
    );
    expect(formatUtcToLocalDateTime(isoUtc, 'America/Sao_Paulo')).toBe(
      '20/11/2026 12:30:45',
    );
  });

  it('usa o fuso padrão quando timeZone não é informado', () => {
    const formatted = formatUtcToLocalDateTime(isoUtc);
    expect(formatted).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
  });

  it('lança erro para timestamp ISO inválido', () => {
    expect(() => formatUtcToLocalDate('data-invalida')).toThrow(
      /Timestamp ISO UTC inválido/,
    );
  });

  it('calcula duração em segundos para intervalo fechado e aberto', () => {
    const start = '2026-11-20T10:00:00.000Z';
    const end = '2026-11-20T11:30:15.000Z';

    expect(calculateDurationSeconds(start, end)).toBe(5415);

    const nowMs = new Date('2026-11-20T10:05:00.000Z').getTime();
    expect(calculateDurationSeconds(start, null, nowMs)).toBe(300);
  });

  it('retorna zero quando o horário final é anterior ao inicial', () => {
    const start = '2026-11-20T12:00:00.000Z';
    const end = '2026-11-20T11:00:00.000Z';

    expect(calculateDurationSeconds(start, end)).toBe(0);
  });

  it('formata duração em HH:MM:SS e HH:MM', () => {
    expect(formatDurationHMS(0)).toBe('00:00:00');
    expect(formatDurationHMS(3661)).toBe('01:01:01');
    expect(formatDurationHMS(-10)).toBe('00:00:00');

    expect(formatDurationHM(0)).toBe('00:00');
    expect(formatDurationHM(5415)).toBe('01:30');
    expect(formatDurationHM(-5)).toBe('00:00');
  });
});
