import type { SupabaseClient } from '@supabase/supabase-js';
import type { PerfilNome, Usuario } from '../../types/domain';

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_CURRENT_PASSWORD'
  | 'WEAK_PASSWORD'
  | 'SESSION_EXPIRED'
  | 'RATE_LIMIT'
  | 'INACTIVE_USER'
  | 'PROFILE_NOT_FOUND'
  | 'NETWORK_OR_DB';

export class AuthServiceError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthServiceError';
    this.code = code;
  }
}

interface UsuarioRow {
  id: string;
  nome: string;
  email: string;
  perfil_id: string;
  ativo: boolean;
  inativado_em: string | null;
  criado_em: string;
  perfis: { nome: PerfilNome } | Array<{ nome: PerfilNome }> | null;
}

function extractPerfilNome(
  perfis: UsuarioRow['perfis'],
): PerfilNome | undefined {
  if (!perfis) return undefined;
  if (Array.isArray(perfis)) {
    return perfis[0]?.nome;
  }
  return perfis.nome;
}

export async function fetchUserProfile(
  client: SupabaseClient,
  userId: string,
): Promise<Usuario> {
  const { data, error } = await client
    .from('usuarios')
    .select(
      'id, nome, email, perfil_id, ativo, inativado_em, criado_em, perfis(nome)',
    )
    .eq('id', userId)
    .maybeSingle<UsuarioRow>();

  if (error) {
    throw new AuthServiceError(
      'NETWORK_OR_DB',
      'Não foi possível validar seu perfil. Tente novamente.',
    );
  }

  if (!data) {
    throw new AuthServiceError(
      'PROFILE_NOT_FOUND',
      'Conta autenticada sem cadastro no sistema. Contate um administrador.',
    );
  }

  if (!data.ativo) {
    throw new AuthServiceError(
      'INACTIVE_USER',
      'Sua conta está inativa. Contate um administrador.',
    );
  }

  const perfil = extractPerfilNome(data.perfis);
  if (!perfil) {
    throw new AuthServiceError(
      'PROFILE_NOT_FOUND',
      'Perfil de acesso não identificado. Contate um administrador.',
    );
  }

  return {
    id: data.id,
    nome: data.nome,
    email: data.email,
    perfil_id: data.perfil_id,
    perfil,
    ativo: data.ativo,
    inativado_em: data.inativado_em,
    criado_em: data.criado_em,
  };
}

function isInvalidCredentialsError(error: { message?: string; status?: number } | null): boolean {
  const msg = error?.message?.toLowerCase() ?? '';
  return (
    msg.includes('invalid login credentials') ||
    msg.includes('invalid_credentials') ||
    error?.status === 400
  );
}

function isRateLimitError(error: { message?: string; status?: number } | null): boolean {
  const msg = error?.message?.toLowerCase() ?? '';
  return (
    error?.status === 429 ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
  );
}

export async function signInWithEmailAndPassword(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<Usuario> {
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.user) {
    if (isInvalidCredentialsError(error)) {
      throw new AuthServiceError(
        'INVALID_CREDENTIALS',
        'E-mail ou senha inválidos.',
      );
    }
    throw new AuthServiceError(
      'NETWORK_OR_DB',
      'Erro ao conectar com o servidor de autenticação. Tente novamente.',
    );
  }

  try {
    return await fetchUserProfile(client, data.user.id);
  } catch (profileError) {
    await client.auth.signOut();
    throw profileError;
  }
}

export async function changeOwnPassword(
  client: SupabaseClient,
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const { data, error: verifyError } = await client.auth.signInWithPassword({
    email: email.trim(),
    password: currentPassword,
  });

  if (verifyError || !data.user) {
    if (isInvalidCredentialsError(verifyError)) {
      throw new AuthServiceError(
        'INVALID_CURRENT_PASSWORD',
        'A senha atual informada está incorreta.',
      );
    }
    if (isRateLimitError(verifyError)) {
      throw new AuthServiceError(
        'RATE_LIMIT',
        'Muitas tentativas seguidas. Aguarde alguns instantes antes de tentar novamente.',
      );
    }
    throw new AuthServiceError(
      'NETWORK_OR_DB',
      'Erro ao validar a senha atual. Tente novamente.',
    );
  }

  try {
    await fetchUserProfile(client, data.user.id);
  } catch (profileError) {
    if (
      profileError instanceof AuthServiceError &&
      (profileError.code === 'INACTIVE_USER' ||
        profileError.code === 'PROFILE_NOT_FOUND')
    ) {
      await client.auth.signOut().catch(() => undefined);
      throw new AuthServiceError(
        'SESSION_EXPIRED',
        'Sua sessão expirou ou sua conta foi inativada. Faça login novamente.',
      );
    }
    throw profileError;
  }

  const { error: updateError } = await client.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    if (isRateLimitError(updateError)) {
      throw new AuthServiceError(
        'RATE_LIMIT',
        'Muitas tentativas seguidas. Aguarde alguns instantes antes de tentar novamente.',
      );
    }
    const msg = updateError.message?.toLowerCase() ?? '';
    if (
      updateError.status === 401 ||
      msg.includes('session') ||
      msg.includes('jwt') ||
      msg.includes('not authenticated')
    ) {
      throw new AuthServiceError(
        'SESSION_EXPIRED',
        'Sua sessão expirou. Faça login novamente.',
      );
    }
    if (
      updateError.status === 422 ||
      msg.includes('password') ||
      msg.includes('weak') ||
      msg.includes('length')
    ) {
      throw new AuthServiceError(
        'WEAK_PASSWORD',
        'A nova senha não atende aos requisitos mínimos de segurança.',
      );
    }
    throw new AuthServiceError(
      'NETWORK_OR_DB',
      'Não foi possível atualizar a senha. Tente novamente.',
    );
  }
}
