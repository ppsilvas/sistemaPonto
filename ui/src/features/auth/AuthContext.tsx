import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../lib/supabase';
import type { Usuario } from '../../types/domain';
import {
  AuthServiceError,
  changeOwnPassword,
  fetchUserProfile,
  signInWithEmailAndPassword,
} from './authService';

export interface AuthContextValue {
  user: Usuario | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<Usuario>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  setUser: (user: Usuario | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  initialUser?: Usuario | null;
  initialLoading?: boolean;
  onSignOut?: () => Promise<void> | void;
  onChangePassword?: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  supabaseClient?: SupabaseClient;
}

export function AuthProvider({
  children,
  initialUser,
  initialLoading,
  onSignOut,
  onChangePassword,
  supabaseClient,
}: AuthProviderProps) {
  const isControlled = initialUser !== undefined || initialLoading !== undefined;
  const [user, setUser] = useState<Usuario | null>(initialUser ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(
    initialLoading ?? !isControlled,
  );
  const [configError, setConfigError] = useState<string | null>(null);

  const getClient = useCallback(
    () => supabaseClient ?? getSupabaseClient(),
    [supabaseClient],
  );

  useEffect(() => {
    if (isControlled) {
      return undefined;
    }

    let active = true;
    let client: SupabaseClient;

    try {
      client = getClient();
    } catch (error) {
      setConfigError(
        error instanceof Error
          ? error.message
          : 'Erro de configuração do Supabase.',
      );
      setIsLoading(false);
      return undefined;
    }

    const hydrateSession = async () => {
      try {
        const { data } = await client.auth.getSession();
        if (!active) return;

        if (!data.session?.user) {
          setUser(null);
          return;
        }

        const profile = await fetchUserProfile(client, data.session.user.id);
        if (active) {
          setUser(profile);
        }
      } catch {
        if (active) {
          await client.auth.signOut().catch(() => undefined);
          setUser(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void hydrateSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null);
        return;
      }

      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        void fetchUserProfile(client, session.user.id)
          .then((profile) => {
            if (active) setUser(profile);
          })
          .catch(() => {
            if (active) setUser(null);
          });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [getClient, isControlled]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<Usuario> => {
      const client = getClient();
      const authenticatedUser = await signInWithEmailAndPassword(
        client,
        email,
        password,
      );
      setUser(authenticatedUser);
      return authenticatedUser;
    },
    [getClient],
  );

  const signOut = useCallback(async () => {
    if (onSignOut) {
      await onSignOut();
    } else if (!isControlled) {
      const client = getClient();
      await client.auth.signOut();
    }
    setUser(null);
  }, [getClient, isControlled, onSignOut]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (onChangePassword) {
        await onChangePassword(currentPassword, newPassword);
        return;
      }
      if (!user) {
        throw new AuthServiceError(
          'SESSION_EXPIRED',
          'Sua sessão expirou. Faça login novamente.',
        );
      }
      const client = getClient();
      await changeOwnPassword(client, user.email, currentPassword, newPassword);
    },
    [getClient, onChangePassword, user],
  );

  if (configError) {
    return (
      <main className="login-page">
        <section className="card login-card" role="alert">
          <h1>Configuração incompleta</h1>
          <p className="alert-error">{configError}</p>
        </section>
      </main>
    );
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, signIn, signOut, changePassword, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }
  return ctx;
}
