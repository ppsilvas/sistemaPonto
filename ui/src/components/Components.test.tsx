import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from './Badge';
import { Button } from './Button';
import { EmptyState, LoadingState } from './FeedbackStates';
import { Input } from './Input';
import { Modal } from './Modal';
import { ToastProvider, useToast } from './ToastContext';

function ToastTrigger() {
  const { showToast } = useToast();
  return (
    <div>
      <button
        type="button"
        onClick={() => showToast({ type: 'success', message: 'Salvo!' })}
      >
        Mostrar sucesso
      </button>
      <button
        type="button"
        onClick={() => showToast({ type: 'error', message: 'Falhou!' })}
      >
        Mostrar erro
      </button>
    </div>
  );
}

describe('Componentes base de UI', () => {
  it('renderiza Button com variantes, tamanho e estado de carregamento', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(
      <Button variant="primary" size="lg" onClick={onClick}>
        Iniciar
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Iniciar' });
    expect(button).toHaveClass('btn', 'btn-primary', 'btn-lg');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button variant="danger" isLoading>
        Iniciar
      </Button>,
    );
    const loadingBtn = screen.getByRole('button', { name: 'Carregando...' });
    expect(loadingBtn).toBeDisabled();
    expect(loadingBtn).toHaveAttribute('aria-busy', 'true');
  });

  it('renderiza Input com label e mensagem de erro acessível', () => {
    const { rerender } = render(<Input label="E-mail" name="email" />);
    const input = screen.getByLabelText('E-mail');
    expect(input).toHaveAttribute('aria-invalid', 'false');

    rerender(<Input label="E-mail" name="email" error="E-mail obrigatório" />);
    expect(screen.getByLabelText('E-mail')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('E-mail obrigatório');
  });

  it('renderiza Badge, LoadingState e EmptyState', () => {
    render(
      <div>
        <Badge variant="admin">Admin</Badge>
        <LoadingState />
        <EmptyState
          title="Sem registros"
          description="Nenhum ponto encontrado."
          action={<Button>Atualizar</Button>}
        />
      </div>,
    );

    expect(screen.getByText('Admin')).toHaveClass('badge', 'badge-admin');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando...');
    expect(screen.getByText('Sem registros')).toBeInTheDocument();
    expect(screen.getByText('Nenhum ponto encontrado.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Atualizar' }),
    ).toBeInTheDocument();
  });

  it('renderiza EmptyState sem descrição nem ação', () => {
    render(<EmptyState title="Lista vazia" />);
    expect(screen.getByText('Lista vazia')).toBeInTheDocument();
  });

  it('controla abertura e fechamento do Modal via botão, backdrop e Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    const { rerender } = render(
      <Modal isOpen={false} title="Confirmar" onClose={onClose}>
        <p>Conteúdo</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <Modal
        isOpen
        title="Confirmar"
        onClose={onClose}
        footer={<Button onClick={onClose}>Ok</Button>}
      >
        <p>Conteúdo</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Confirmar' });
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fechar modal' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('exibe e remove toasts via ToastProvider e valida uso fora do provider', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Mostrar sucesso' }));
    expect(screen.getByRole('status')).toHaveTextContent('Salvo!');

    await user.click(screen.getByRole('button', { name: 'Mostrar erro' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou!');

    const closeButtons = screen.getAllByRole('button', {
      name: 'Fechar notificação',
    });
    await user.click(closeButtons[0]!);
    expect(screen.queryByText('Salvo!')).not.toBeInTheDocument();

    expect(() => render(<ToastTrigger />)).toThrow(
      /useToast deve ser usado dentro de ToastProvider/,
    );
  });
});
