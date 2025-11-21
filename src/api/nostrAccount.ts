import { getStrapiBaseUrl, strapiFetch } from './strapi-client';

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

  const response = await fetchFromPath(`/api/users/${userId}?${query}`).catch((error) => {
    if (error instanceof Error) {
      if (/status\s+403/.test(error.message)) {
        return fetchFromPath(`/api/users/me?${query}`);
      }
      if (/status\s+404/.test(error.message)) {
        return null;
      }
    }
    throw error;
  });

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
