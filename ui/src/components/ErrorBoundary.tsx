import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erro não tratado na aplicação:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="login-page">
          <section className="card login-card" role="alert">
            <h1>Erro ao carregar a aplicação</h1>
            <p className="alert-error">{this.state.error.message}</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
