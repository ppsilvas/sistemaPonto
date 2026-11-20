import type { ReactNode } from 'react';

export interface LoadingStateProps {
  message?: string;
}

export function LoadingState({
  message = 'Carregando...',
}: LoadingStateProps) {
  return (
    <div className="feedback-state" role="status" aria-live="polite">
      <span>{message}</span>
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="feedback-state">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
