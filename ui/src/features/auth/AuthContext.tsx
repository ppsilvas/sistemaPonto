import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import type { Usuario } from '../../types/domain';

export interface AuthContextValue {
  user: Usuario | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  setUser: (user: Usuario | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  initialUser?: Usuario | null;
  initialLoading?: boolean;
  onSignOut?: () => Promise<void> | void;
}

export function AuthProvider({
  children,
  initialUser = null,
  initialLoading = false,
  onSignOut,
}: AuthProviderProps) {
  const [user, setUser] = useState<Usuario | null>(initialUser);
  const [isLoading] = useState<boolean>(initialLoading);

  const signOut = useCallback(async () => {
    if (onSignOut) {
      await onSignOut();
    }
    setUser(null);
  }, [onSignOut]);

  return (
    <AuthContext.Provider value={{ user, isLoading, signOut, setUser }}>
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
