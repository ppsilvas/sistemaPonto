import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useToast } from '../components/ToastContext';

const DEFAULT_THROTTLE_MS = 60_000;
const DEFAULT_VERSION_URL = '/version.json';

interface VersionPayload {
  buildId?: unknown;
}

export interface UseVersionCheckOptions {
  enabled?: boolean;
  currentBuildId?: string;
  throttleMs?: number;
  versionUrl?: string;
  fetchFn?: typeof fetch;
  onReload?: () => void;
  nowFn?: () => number;
}

function getDefaultBuildId(): string {
  return typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : '';
}

function reloadPage(): void {
  window.location.reload();
}

export function useVersionCheck(options: UseVersionCheckOptions = {}): void {
  const {
    enabled = import.meta.env.PROD,
    currentBuildId = getDefaultBuildId(),
    throttleMs = DEFAULT_THROTTLE_MS,
    versionUrl = DEFAULT_VERSION_URL,
    fetchFn = globalThis.fetch,
    onReload = reloadPage,
    nowFn = Date.now,
  } = options;

  const { showToast } = useToast();
  const location = useLocation();
  const lastCheckAtRef = useRef<number | null>(null);
  const notifiedRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (!enabled || !currentBuildId || notifiedRef.current) {
      return;
    }

    const now = nowFn();
    if (
      lastCheckAtRef.current !== null &&
      now - lastCheckAtRef.current < throttleMs
    ) {
      return;
    }
    lastCheckAtRef.current = now;

    try {
      const response = await fetchFn(`${versionUrl}?t=${now}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as VersionPayload;
      if (
        typeof payload.buildId === 'string' &&
        payload.buildId.trim().length > 0 &&
        payload.buildId !== currentBuildId
      ) {
        notifiedRef.current = true;
        showToast({
          type: 'info',
          message:
            'Nova versão disponível. Recarregue a página para atualizar.',
          action: {
            label: 'Atualizar',
            onClick: onReload,
          },
        });
      }
    } catch {
      // Falhas transitórias de rede não devem interromper a experiência do usuário.
    }
  }, [
    currentBuildId,
    enabled,
    fetchFn,
    nowFn,
    onReload,
    showToast,
    throttleMs,
    versionUrl,
  ]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void checkForUpdate();
  }, [checkForUpdate, enabled, location.pathname]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const handleFocus = () => {
      void checkForUpdate();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdate();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkForUpdate, enabled]);
}
