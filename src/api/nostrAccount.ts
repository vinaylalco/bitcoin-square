import { getStrapiBaseUrl, strapiFetch, StrapiRequestError } from './strapi-client';

export interface AccountNostrKeyResponse {
  nostrPublicKey?: string;
  nostrEncryptedKey?: string;
}

function coerceString(
  source: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

export async function fetchAccountNostrKeys(
  userId: number,
  jwt: string,
): Promise<AccountNostrKeyResponse | null> {
  if (!getStrapiBaseUrl()) {
    return Promise.resolve(null);
  }
  const query = 'fields[0]=nostrPublicKey&fields[1]=nostrEncryptedKey';

  const fetchFromPath = (path: string, includeFields: boolean) =>
    strapiFetch<Record<string, unknown> | null>(
      includeFields ? `${path}?${query}` : path,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      },
    );

  const attempts: Array<{ path: string; includeFields: boolean }> = [
    { path: `/api/users/${userId}`, includeFields: true },
    { path: `/api/profile`, includeFields: true },
    { path: `/api/users/${userId}`, includeFields: false },
    { path: `/api/profile`, includeFields: false },
  ];

  const response = await (async () => {
    for (const attempt of attempts) {
      try {
        return await fetchFromPath(attempt.path, attempt.includeFields);
      } catch (error) {
        if (error instanceof StrapiRequestError) {
          if (error.status === 404) {
            return null;
          }
          if ([400, 403].includes(error.status)) {
            continue;
          }
        }

        if (error instanceof Error && /status\s+404/.test(error.message)) {
          return null;
        }
        if (error instanceof Error && /status\s+(400|403)/.test(error.message)) {
          continue;
        }

        throw error;
      }
    }
    return null;
  })();

  if (!response || typeof response !== 'object') {
    return null;
  }
  if ('error' in response && typeof response.error === 'object') {
    return null;
  }
  const record = response as Record<string, unknown>;
  const normalized: AccountNostrKeyResponse = {
    nostrPublicKey: coerceString(record, 'nostrPublicKey', 'publicKey', 'pubkey', 'npub'),
    nostrEncryptedKey: coerceString(
      record,
      'nostrEncryptedKey',
      'encryptedKey',
      'ciphertext',
    ),
  };
  if (!normalized.nostrPublicKey && !normalized.nostrEncryptedKey) {
    return null;
  }
  return normalized;
}
