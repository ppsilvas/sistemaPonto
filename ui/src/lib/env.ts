export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

type EnvRecord = Record<string, string | boolean | undefined>;

function readString(value: string | boolean | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getSupabaseEnv(
  envSource: EnvRecord = import.meta.env as unknown as EnvRecord,
): SupabaseEnv {
  const url = readString(envSource.VITE_SUPABASE_URL);
  const anonKey =
    readString(envSource.VITE_SUPABASE_ANON_KEY) ||
    readString(envSource.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    readString(envSource.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY);

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
