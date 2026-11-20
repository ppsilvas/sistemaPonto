import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Clock, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../components/Button';
import { LoadingState } from '../../components/FeedbackStates';
import { Input } from '../../components/Input';
import { useAuth } from './AuthContext';

interface LocationState {
  from?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { user, isLoading: authLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const returnUrl =
    state?.from && state.from !== '/login' ? state.from : '/ponto';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (authLoading) {
    return <LoadingState message="Verificando sessão..." />;
  }

  if (user && user.ativo) {
    return <Navigate to={returnUrl} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(undefined);

    const trimmedEmail = email.trim();
    let hasError = false;

    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setEmailError('Informe um e-mail válido.');
      hasError = true;
    } else {
      setEmailError(undefined);
    }

    if (!password) {
      setPasswordError('Informe sua senha.');
      hasError = true;
    } else {
      setPasswordError(undefined);
    }

    if (hasError) {
      return;
    }

    setIsSubmitting(true);
    try {
      await signIn(trimmedEmail, password);
      navigate(returnUrl, { replace: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro ao realizar login. Tente novamente.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="card login-card" aria-label="Autenticação">
        <div className="login-header">
          <div className="app-brand">
            <Clock size={24} aria-hidden="true" />
            <span>Ponto Lelê</span>
          </div>
          <h1>Entrar no Ponto Lelê</h1>
          <p className="login-subtitle">
            Acesse com seu e-mail e senha corporativos.
          </p>
        </div>

        {submitError ? (
          <div className="alert-error" role="alert">
            {submitError}
          </div>
        ) : null}

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <Input
            label="E-mail"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="nome@empresa.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={emailError}
            disabled={isSubmitting}
          />

          <div className="password-field">
            <Input
              label="Senha"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={passwordError}
              disabled={isSubmitting}
            />
            <button
              type="button"
              className="btn btn-ghost password-toggle"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? (
                <EyeOff size={18} aria-hidden="true" />
              ) : (
                <Eye size={18} aria-hidden="true" />
              )}
              <span>{showPassword ? 'Ocultar' : 'Mostrar'}</span>
            </button>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSubmitting}
          >
            Entrar
          </Button>
        </form>
      </section>
    </main>
  );
}
