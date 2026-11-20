import type { SupabaseClient } from '@supabase/supabase-js';
import type { PerfilNome, Usuario } from '../../types/domain';

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
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
    const msg = error?.message?.toLowerCase() ?? '';
    if (
      msg.includes('invalid login credentials') ||
      msg.includes('invalid_credentials') ||
      error?.status === 400
    ) {
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
