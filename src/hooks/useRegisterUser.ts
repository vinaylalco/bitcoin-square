import { useCallback, useState } from 'react';

type Fetcher = typeof fetch;

export interface RegisterUserPayload {
  username: string;
  email: string;
  password: string;
  /**
   * @deprecated Transaction hashes must be associated with memberships only.
   */
  txHash?: string;
  [key: string]: unknown;
}

export interface RegisterUserResponse {
  jwt: string;
  user: {
    id: number;
    username: string;
    email: string;
    txHash: string;
    [key: string]: unknown;
  };
}

interface EnsureUniqueTxHashOptions {
  baseUrl: string;
  fetcher?: Fetcher;
  maxAttempts?: number;
}

const USERS_ENDPOINT = '/api/users';
const REGISTER_ENDPOINT = '/api/auth/local/register';

const generateRandomTxHash = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, '');

const txHashExists = async (
  baseUrl: string,
  txHash: string,
  fetcher: Fetcher = fetch,
): Promise<boolean> => {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}${USERS_ENDPOINT}`);
  url.searchParams.append('filters[txHash][$eq]', txHash);
  const response = await fetcher(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to check txHash uniqueness: ${response.status} ${response.statusText}. ${body}`,
    );
  }

  const payload = await response.json();

  if (Array.isArray(payload)) {
    return payload.length > 0;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data.length > 0;
  }

  return Boolean(payload?.data);
};

export const ensureUniqueTxHash = async (
  initialTxHash: string,
  options: EnsureUniqueTxHashOptions,
): Promise<string> => {
  const { baseUrl, fetcher = fetch, maxAttempts = 10 } = options;

  let candidate = initialTxHash || generateRandomTxHash();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const exists = await txHashExists(baseUrl, candidate, fetcher);

    if (!exists) {
      return candidate;
    }

    candidate = generateRandomTxHash();
  }

  throw new Error(
    `Unable to generate a unique txHash after ${maxAttempts} attempts. Consider investigating collisions.`,
  );
};

export const useRegisterUser = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerUser = useCallback(
    async (payload: RegisterUserPayload): Promise<RegisterUserResponse> => {
      setIsLoading(true);
      setError(null);

      try {
        const baseUrl = import.meta.env.VITE_API_URL;

        if (!baseUrl) {
          throw new Error('VITE_API_URL is not configured. Please set it in your environment.');
        }

        const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
        const { txHash: _deprecatedTxHash, ...restPayload } = payload;

        const response = await fetch(`${normalizedBaseUrl}${REGISTER_ENDPOINT}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(restPayload),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          const message =
            errorBody?.error?.message ?? errorBody?.message ?? 'Failed to register user. Please try again.';
          throw new Error(message);
        }

        const data = (await response.json()) as RegisterUserResponse;

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred during registration.';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { registerUser, isLoading, error };
};

export type UseRegisterUserReturn = ReturnType<typeof useRegisterUser>;
