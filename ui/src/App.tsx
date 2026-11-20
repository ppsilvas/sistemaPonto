import { Analytics } from '@vercel/analytics/react';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './app/AppRouter';
import { ToastProvider } from './components/ToastContext';
import { AuthProvider, type AuthProviderProps } from './features/auth/AuthContext';

export interface AppProps {
  authProps?: Omit<AuthProviderProps, 'children'>;
}

export function App({ authProps }: AppProps) {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider {...authProps}>
          <AppRouter />
          <Analytics />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
