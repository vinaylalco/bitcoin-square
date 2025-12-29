import { useEffect, useState } from 'react';
import { getMe, StrapiApiError } from '../../lib/strapiClient';

type UseMeStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseMeOptions<T> {
  enabled?: boolean;
  onSuccess?: (user: T) => void;
  onUnauthorized?: () => void;
  onError?: (error: unknown) => void;
  onSettled?: () => void;
}

export function useMe<T = unknown>(
  token: string | null,
  options: UseMeOptions<T> = {},
) {
  const {
    enabled = true,
    onSuccess,
    onUnauthorized,
    onError,
    onSettled,
  } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<UseMeStatus>('idle');

  useEffect(() => {
    if (!token || !enabled) {
      setData(null);
      setError(null);
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);

    getMe<T>(token)
      .then((user) => {
        if (cancelled) return;
        setData(user);
        setStatus('success');
        onSuccess?.(user);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setStatus('error');
        if (
          err instanceof StrapiApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          onUnauthorized?.();
          return;
        }
        onError?.(err);
      })
      .finally(() => {
        if (!cancelled) {
          onSettled?.();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, onError, onSettled, onSuccess, onUnauthorized, token]);

  return { data, error, status };
}
