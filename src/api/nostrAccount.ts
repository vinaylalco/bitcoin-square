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

export function fetchAccountNostrKeys(
  userId: number,
  jwt: string,
): Promise<AccountNostrKeyResponse | null> {
  if (!getStrapiBaseUrl()) {
    return Promise.resolve(null);
  }
  const params = new URLSearchParams();
  params.append('fields[0]', 'nostrPublicKey');
  params.append('fields[1]', 'nostrPrivateKey');
  params.append('fields[2]', 'nostrEncryptedKey');
  return strapiFetch<Record<string, unknown> | null>(
    `/api/users/${userId}?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  )
    .then((response) => {
      if (!response || typeof response !== 'object') {
        return null;
      }
      if ('error' in response && typeof response.error === 'object') {
        return null;
      }
      const record = response as Record<string, unknown>;
      const normalized: AccountNostrKeyResponse = {
        nostrPublicKey: coerceString(
          record,
          'nostrPublicKey',
          'publicKey',
          'pubkey',
          'npub',
        ),
        nostrPrivateKey: coerceString(
          record,
          'nostrPrivateKey',
          'privateKey',
          'privkey',
          'nsec',
        ),
        nostrEncryptedKey: coerceString(
          record,
          'nostrEncryptedKey',
          'encryptedKey',
          'ciphertext',
        ),
      };
      if (
        !normalized.nostrPublicKey &&
        !normalized.nostrPrivateKey &&
        !normalized.nostrEncryptedKey
      ) {
        return null;
      }
      return normalized;
    })
    .catch((error) => {
      if (error instanceof Error && /status\s+404/.test(error.message)) {
        return null;
      }
      throw error;
    });
}
