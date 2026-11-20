import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { LoadingState } from '../components/FeedbackStates';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../features/auth/AuthContext';

export function PrivateRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingState message="Verificando sessão..." />;
  }

  if (!user || !user.ativo) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function AdminRoute() {
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();

  const isAuthorized = Boolean(user && user.ativo && user.perfil === 'admin');
  const shouldNotifyDenied = Boolean(
    !isLoading && user && user.ativo && user.perfil !== 'admin',
  );

  useEffect(() => {
    if (shouldNotifyDenied) {
      showToast({
        type: 'info',
        message: 'Acesso restrito a administradores.',
      });
    }
  }, [shouldNotifyDenied, showToast]);

  if (isLoading) {
    return <LoadingState message="Verificando permissões..." />;
  }

  if (!user || !user.ativo) {
    return <Navigate to="/login" replace />;
  }

  if (!isAuthorized) {
    return <Navigate to="/ponto" replace />;
  }

  return <Outlet />;
}
