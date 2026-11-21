import { describe, expect, it } from 'vitest';
import {
  calculateDurationSeconds,
  endOfLocalDayToUtcIso,
  formatDurationDecimalHours,
  formatDurationHM,
  formatDurationHMS,
  formatDurationHuman,
  formatLocalDateInput,
  formatTotalHours,
  formatUtcToLocalDate,
  formatUtcToLocalDateTime,
  formatUtcToLocalTime,
  getLocalDateRangeForPreset,
  getPeriodRange,
  startOfLocalDayToUtcIso,
  sumClosedSessionsDurationSeconds,
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
    expect(formatTotalHours(360000)).toBe('100:00');
  });

  it('converte limites de dia local YYYY-MM-DD para ISO UTC', () => {
    const startIso = startOfLocalDayToUtcIso('2026-11-15');
    const endIso = endOfLocalDayToUtcIso('2026-11-15');

    const expectedStart = new Date(2026, 10, 15, 0, 0, 0, 0).toISOString();
    const expectedEnd = new Date(2026, 10, 15, 23, 59, 59, 999).toISOString();

    expect(startIso).toBe(expectedStart);
    expect(endIso).toBe(expectedEnd);
    expect(new Date(endIso).getTime()).toBeGreaterThan(
      new Date(startIso).getTime(),
    );
  });

  it('rejeita datas locais inválidas ou inexistentes no calendário', () => {
    expect(() => startOfLocalDayToUtcIso('15/11/2026')).toThrow(
      /Data local inválida/,
    );
    expect(() => endOfLocalDayToUtcIso('2026-02-30')).toThrow(
      /Data local inexistente/,
    );
  });

  it('calcula atalhos de período corretamente', () => {
    const ref = new Date(2026, 10, 18, 14, 0, 0); // Quarta-feira, 18/11/2026
    expect(formatLocalDateInput(ref)).toBe('2026-11-18');

    expect(getPeriodRange('hoje', ref)).toEqual({
      startDate: '2026-11-18',
      endDate: '2026-11-18',
    });
    expect(getPeriodRange('esta_semana', ref)).toEqual({
      startDate: '2026-11-16',
      endDate: '2026-11-22',
    });
    expect(getPeriodRange('este_mes', ref)).toEqual({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    expect(getPeriodRange('mes_anterior', ref)).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
  });

  it('calcula esta_semana corretamente quando a referência é domingo', () => {
    const sunday = new Date(2026, 10, 22, 10, 0, 0); // Domingo, 22/11/2026
    expect(getPeriodRange('esta_semana', sunday)).toEqual({
      startDate: '2026-11-16',
      endDate: '2026-11-22',
    });
  });

  it('converte limites de dia local YYYY-MM-DD para ISO UTC de forma determinística', () => {
    const startIso = startOfLocalDayToUtcIso('2026-11-20');
    const endIso = endOfLocalDayToUtcIso('2026-11-20');

    const expectedStart = new Date(2026, 10, 20, 0, 0, 0, 0).toISOString();
    const expectedEnd = new Date(2026, 10, 20, 23, 59, 59, 999).toISOString();

    expect(startIso).toBe(expectedStart);
    expect(endIso).toBe(expectedEnd);
    expect(new Date(endIso).getTime() - new Date(startIso).getTime()).toBe(
      86399999,
    );
  });

  it('lança erro para datas locais inválidas ou inexistentes', () => {
    expect(() => startOfLocalDayToUtcIso('20/11/2026')).toThrow(
      /Data local inválida/,
    );
    expect(() => endOfLocalDayToUtcIso('2026-02-31')).toThrow(
      /Data local inexistente/,
    );
  });

  it('calcula atalhos de período local corretamente', () => {
    const refFriday = new Date(2026, 10, 20, 14, 0, 0);
    expect(formatLocalDateInput(refFriday)).toBe('2026-11-20');
    expect(getLocalDateRangeForPreset('today', refFriday)).toEqual({
      startDate: '2026-11-20',
      endDate: '2026-11-20',
    });
    expect(getLocalDateRangeForPreset('this_week', refFriday)).toEqual({
      startDate: '2026-11-16',
      endDate: '2026-11-22',
    });
    expect(getLocalDateRangeForPreset('this_month', refFriday)).toEqual({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    expect(getLocalDateRangeForPreset('last_month', refFriday)).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });

    const refSunday = new Date(2026, 10, 22, 10, 0, 0);
    expect(getLocalDateRangeForPreset('this_week', refSunday)).toEqual({
      startDate: '2026-11-16',
      endDate: '2026-11-22',
    });

    const refJan = new Date(2026, 0, 15, 10, 0, 0);
    expect(getLocalDateRangeForPreset('last_month', refJan)).toEqual({
      startDate: '2025-12-01',
      endDate: '2025-12-31',
    });
  });

  it('formata horas humanas e decimais e soma sessões encerradas sem erro cumulativo', () => {
    expect(formatDurationHuman(0)).toBe('00h 00m');
    expect(formatDurationHuman(13530)).toBe('03h 45m');
    expect(formatDurationDecimalHours(13500)).toBe('3,75h');
    expect(formatDurationDecimalHours(117900)).toBe('32,75h');

    const total = sumClosedSessionsDurationSeconds([
      {
        horario_entrada: '2026-11-20T10:00:00.000Z',
        horario_saida: '2026-11-20T10:00:40.000Z',
      },
      {
        horario_entrada: '2026-11-20T11:00:00.000Z',
        horario_saida: '2026-11-20T11:00:40.000Z',
      },
      {
        horario_entrada: '2026-11-20T12:00:00.000Z',
        horario_saida: null,
      },
    ]);

    expect(total).toBe(80);
    expect(formatDurationHuman(total)).toBe('00h 01m');
  });
});
