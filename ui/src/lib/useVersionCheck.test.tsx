import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ToastContext';
import {
  useVersionCheck,
  type UseVersionCheckOptions,
} from './useVersionCheck';

function VersionCheckHarness({
  options,
}: {
  options: UseVersionCheckOptions;
}) {
  useVersionCheck(options);
  const navigate = useNavigate();

  return (
    <button type="button" onClick={() => navigate('/relatorios')}>
      Ir para Relatórios
    </button>
  );
}

function renderHarness(options: UseVersionCheckOptions) {
  return render(
    <MemoryRouter initialEntries={['/ponto']}>
      <ToastProvider>
        <VersionCheckHarness options={options} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('useVersionCheck (PPS-21)', () => {
  it('não realiza requisições quando desabilitado ou sem buildId atual', () => {
    const fetchFn = vi.fn();

    const first = renderHarness({
      enabled: false,
      currentBuildId: 'build-1',
      fetchFn,
    });
    expect(fetchFn).not.toHaveBeenCalled();
    first.unmount();

    renderHarness({
      enabled: true,
      currentBuildId: '',
      fetchFn,
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('não exibe alerta quando a versão remota é igual à atual e respeita throttle', async () => {
    const user = userEvent.setup();
    let now = 10_000;
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'build-1' }),
    }) as unknown as typeof fetch;

    renderHarness({
      enabled: true,
      currentBuildId: 'build-1',
      throttleMs: 60_000,
      fetchFn,
      nowFn: () => now,
    });

    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByText(/Nova versão disponível/),
    ).not.toBeInTheDocument();

    // Dentro da janela de throttle: não consulta novamente
    now += 5_000;
    await user.click(screen.getByRole('button', { name: 'Ir para Relatórios' }));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Após janela de throttle e retorno de visibilidade: consulta novamente
    now += 65_000;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  it('exibe toast com ação Atualizar quando detecta novo buildId e evita notificações duplicadas', async () => {
    const user = userEvent.setup();
    let now = 100_000;
    const onReload = vi.fn();
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'build-2' }),
    }) as unknown as typeof fetch;

    renderHarness({
      enabled: true,
      currentBuildId: 'build-1',
      throttleMs: 1_000,
      fetchFn,
      onReload,
      nowFn: () => now,
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          'Nova versão disponível. Recarregue a página para atualizar.',
        ),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(onReload).toHaveBeenCalledTimes(1);

    // Mesmo após throttle expirar, não notifica novamente
    now += 10_000;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('ignora silenciosamente respostas HTTP de erro, payloads inválidos e falhas de rede', async () => {
    let now = 1_000;
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ buildId: '' }),
      })
      .mockRejectedValueOnce(new Error('Network offline')) as unknown as typeof fetch;

    renderHarness({
      enabled: true,
      currentBuildId: 'build-1',
      throttleMs: 1_000,
      fetchFn,
      nowFn: () => now,
    });

    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    now += 2_000;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    now += 2_000;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    expect(
      screen.queryByText(/Nova versão disponível/),
    ).not.toBeInTheDocument();
  });
});
