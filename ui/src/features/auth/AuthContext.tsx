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
  fetchUserProfile,
  signInWithEmailAndPassword,
} from './authService';

export interface AuthContextValue {
  user: Usuario | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<Usuario>;
  signOut: () => Promise<void>;
  setUser: (user: Usuario | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  initialUser?: Usuario | null;
  initialLoading?: boolean;
  onSignOut?: () => Promise<void> | void;
  supabaseClient?: SupabaseClient;
}

export function AuthProvider({
  children,
  initialUser,
  initialLoading,
  onSignOut,
  supabaseClient,
}: AuthProviderProps) {
  const isControlled = initialUser !== undefined || initialLoading !== undefined;
  const [user, setUser] = useState<Usuario | null>(initialUser ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(
    initialLoading ?? !isControlled,
  );

  const getClient = useCallback(
    () => supabaseClient ?? getSupabaseClient(),
    [supabaseClient],
  );

  useEffect(() => {
    if (isControlled) {
      return undefined;
    }

    let active = true;
    const client = getClient();

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

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut, setUser }}>
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
