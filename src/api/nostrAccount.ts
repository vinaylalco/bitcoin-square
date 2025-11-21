import { getStrapiBaseUrl, strapiFetch, StrapiRequestError } from './strapi-client';

export interface AccountNostrKeyResponse {
  nostrPublicKey?: string;
  nostrPrivateKey?: string;
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
  const query =
    'fields[0]=nostrPublicKey&fields[1]=nostrPrivateKey&fields[2]=nostrEncryptedKey';

  const fetchFromPath = (path: string) =>
    strapiFetch<Record<string, unknown> | null>(path, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    });

  const response = await (async () => {
    try {
      return await fetchFromPath(`/api/users/${userId}?${query}`);
    } catch (error) {
      const isFallbackAllowed =
        error instanceof StrapiRequestError
          ? error.status === 403 || error.status === 400
          : error instanceof Error && /status\s+403/.test(error.message);

      if (isFallbackAllowed) {
        try {
          return await fetchFromPath(`/api/users/me?${query}`);
        } catch (innerError) {
          if (
            innerError instanceof StrapiRequestError &&
            [400, 403, 404].includes(innerError.status)
          ) {
            return null;
          }
          throw innerError;
        }
      }

      if (error instanceof StrapiRequestError && error.status === 404) {
        return null;
      }

      if (error instanceof Error && /status\s+404/.test(error.message)) {
        return null;
      }

      throw error;
    }
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
    nostrPrivateKey: coerceString(record, 'nostrPrivateKey', 'privateKey', 'privkey', 'nsec'),
    nostrEncryptedKey: coerceString(
      record,
      'nostrEncryptedKey',
      'encryptedKey',
      'ciphertext',
    ),
  };
  if (!normalized.nostrPublicKey && !normalized.nostrPrivateKey && !normalized.nostrEncryptedKey) {
    return null;
  }
  return normalized;
}
