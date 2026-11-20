import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSupabaseClient,
  resetSupabaseClientForTests,
} from './supabase';

describe('getSupabaseClient', () => {
  afterEach(() => {
    resetSupabaseClientForTests();
    vi.unstubAllEnvs();
  });

  it('cria e reutiliza o cliente Supabase quando as variáveis estão configuradas', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://teste.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

    const first = getSupabaseClient();
    const second = getSupabaseClient();

    expect(first).toBe(second);
    expect(first.auth).toBeDefined();
  });

  it('falha quando variáveis obrigatórias não estão definidas', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    expect(() => getSupabaseClient()).toThrow(
      /Variáveis de ambiente obrigatórias do Supabase ausentes/,
    );
  });
});
