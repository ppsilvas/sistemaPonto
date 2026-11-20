import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useToast } from '../../components/ToastContext';
import { useAuth } from './AuthContext';
import { AuthServiceError } from './authService';

const MIN_PASSWORD_LENGTH = 8;

interface PasswordInputFieldProps {
  label: string;
  name: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
  toggleLabelShow: string;
  toggleLabelHide: string;
  error?: string;
  disabled: boolean;
  hint?: string;
}

function PasswordInputField({
  label,
  name,
  autoComplete,
  value,
  onChange,
  show,
  onToggleShow,
  toggleLabelShow,
  toggleLabelHide,
  error,
  disabled,
  hint,
}: PasswordInputFieldProps) {
  return (
    <div className="password-field">
      <Input
        label={label}
        name={name}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder="••••••••"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
        disabled={disabled}
      />
      <div className="password-field-meta">
        {hint ? <span className="field-hint">{hint}</span> : <span />}
        <button
          type="button"
          className="btn btn-ghost password-toggle"
          aria-label={show ? toggleLabelHide : toggleLabelShow}
          onClick={onToggleShow}
          disabled={disabled}
        >
          {show ? (
            <EyeOff size={18} aria-hidden="true" />
          ) : (
            <Eye size={18} aria-hidden="true" />
          )}
          <span>{show ? 'Ocultar' : 'Mostrar'}</span>
        </button>
      </div>
    </div>
  );
}

export function AlterarSenhaPage() {
  const { changePassword, signOut } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [currentPasswordError, setCurrentPasswordError] = useState<
    string | undefined
  >();
  const [newPasswordError, setNewPasswordError] = useState<
    string | undefined
  >();
  const [confirmPasswordError, setConfirmPasswordError] = useState<
    string | undefined
  >();

  const [submitError, setSubmitError] = useState<string | undefined>();
  const [submitSuccess, setSubmitSuccess] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(undefined);
    setSubmitSuccess(undefined);

    let hasError = false;

    if (!currentPassword) {
      setCurrentPasswordError('Informe sua senha atual.');
      hasError = true;
    } else {
      setCurrentPasswordError(undefined);
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setNewPasswordError('A nova senha deve ter pelo menos 8 caracteres.');
      hasError = true;
    } else if (currentPassword && newPassword === currentPassword) {
      setNewPasswordError('A nova senha deve ser diferente da senha atual.');
      hasError = true;
    } else {
      setNewPasswordError(undefined);
    }

    if (!confirmPassword || confirmPassword !== newPassword) {
      setConfirmPasswordError('A confirmação não confere com a nova senha.');
      hasError = true;
    } else {
      setConfirmPasswordError(undefined);
    }

    if (hasError) {
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setSubmitSuccess('Senha alterada com sucesso.');
      showToast({
        type: 'success',
        message: 'Senha alterada com sucesso.',
      });
    } catch (error) {
      if (error instanceof AuthServiceError) {
        if (error.code === 'INVALID_CURRENT_PASSWORD') {
          setCurrentPasswordError(error.message);
          return;
        }
        if (error.code === 'WEAK_PASSWORD') {
          setNewPasswordError(error.message);
          return;
        }
        if (
          error.code === 'SESSION_EXPIRED' ||
          error.code === 'INACTIVE_USER'
        ) {
          await signOut();
          showToast({ type: 'error', message: error.message });
          navigate('/login', { replace: true });
          return;
        }
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a senha. Tente novamente.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section aria-labelledby="alterar-senha-heading">
      <div className="page-header">
        <div>
          <h1 id="alterar-senha-heading">Alterar Senha</h1>
          <p className="login-subtitle">
            Atualize sua senha de acesso informando a senha atual e a nova
            senha.
          </p>
        </div>
      </div>

      <div className="card password-change-card">
        {submitError ? (
          <div className="alert-error" role="alert">
            {submitError}
          </div>
        ) : null}

        {submitSuccess ? (
          <div className="alert-success" role="status">
            {submitSuccess}
          </div>
        ) : null}

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <PasswordInputField
            label="Senha atual"
            name="currentPassword"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrentPassword}
            onToggleShow={() => setShowCurrentPassword((prev) => !prev)}
            toggleLabelShow="Mostrar senha atual"
            toggleLabelHide="Ocultar senha atual"
            error={currentPasswordError}
            disabled={isSubmitting}
          />

          <PasswordInputField
            label="Nova senha"
            name="newPassword"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            show={showNewPassword}
            onToggleShow={() => setShowNewPassword((prev) => !prev)}
            toggleLabelShow="Mostrar nova senha"
            toggleLabelHide="Ocultar nova senha"
            error={newPasswordError}
            disabled={isSubmitting}
            hint="Mínimo de 8 caracteres."
          />

          <PasswordInputField
            label="Confirmar nova senha"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirmPassword}
            onToggleShow={() => setShowConfirmPassword((prev) => !prev)}
            toggleLabelShow="Mostrar confirmação da nova senha"
            toggleLabelHide="Ocultar confirmação da nova senha"
            error={confirmPasswordError}
            disabled={isSubmitting}
          />

          <div className="password-change-actions">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
            >
              <KeyRound size={18} aria-hidden="true" />
              <span>Salvar nova senha</span>
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
