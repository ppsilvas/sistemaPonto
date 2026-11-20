import { Analytics } from '@vercel/analytics/react';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './app/AppRouter';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastContext';
import { AuthProvider, type AuthProviderProps } from './features/auth/AuthContext';

export interface AppProps {
  authProps?: Omit<AuthProviderProps, 'children'>;
}

export function App({ authProps }: AppProps) {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider {...authProps}>
            <AppRouter />
            <Analytics />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
