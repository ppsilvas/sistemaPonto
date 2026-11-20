import { describe, expect, it } from 'vitest';
import { getSupabaseEnv } from './env';

describe('getSupabaseEnv', () => {
  it('retorna url e anonKey quando ambas estão preenchidas', () => {
    const result = getSupabaseEnv({
      VITE_SUPABASE_URL: 'https://exemplo.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key-123',
    });

    expect(result).toEqual({
      url: 'https://exemplo.supabase.co',
      anonKey: 'anon-key-123',
    });
  });

  it('remove espaços extras das variáveis', () => {
    const result = getSupabaseEnv({
      VITE_SUPABASE_URL: '  https://exemplo.supabase.co  ',
      VITE_SUPABASE_ANON_KEY: '  anon-key-123  ',
    });

    expect(result).toEqual({
      url: 'https://exemplo.supabase.co',
      anonKey: 'anon-key-123',
    });
  });

  it('lança erro quando VITE_SUPABASE_URL está ausente', () => {
    expect(() =>
      getSupabaseEnv({
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_ANON_KEY: 'anon-key-123',
      }),
    ).toThrow(/VITE_SUPABASE_URL/);
  });

  it('lança erro quando VITE_SUPABASE_ANON_KEY está ausente', () => {
    expect(() =>
      getSupabaseEnv({
        VITE_SUPABASE_URL: 'https://exemplo.supabase.co',
        VITE_SUPABASE_ANON_KEY: undefined,
      }),
    ).toThrow(/VITE_SUPABASE_ANON_KEY/);
  });
});
