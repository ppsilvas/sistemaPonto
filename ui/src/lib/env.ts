export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

type EnvRecord = Record<string, string | boolean | undefined>;

export function getSupabaseEnv(
  envSource: EnvRecord = import.meta.env as unknown as EnvRecord,
): SupabaseEnv {
  const rawUrl = envSource.VITE_SUPABASE_URL;
  const rawAnonKey = envSource.VITE_SUPABASE_ANON_KEY;

  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  const anonKey = typeof rawAnonKey === 'string' ? rawAnonKey.trim() : '';

  const missing: string[] = [];
  if (!url) {
    missing.push('VITE_SUPABASE_URL');
  }
  if (!anonKey) {
    missing.push('VITE_SUPABASE_ANON_KEY');
  }

  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias do Supabase ausentes: ${missing.join(', ')}. Verifique o arquivo .env.`,
    );
  }

  return { url, anonKey };
}
