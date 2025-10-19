import { getStrapiBaseUrl, strapiFetch } from './strapi-client';

export interface AccountNostrKeyResponse {
  nostrPublicKey?: string;
  nostrPrivateKey?: string;
  nostrEncryptedKey?: string;
}

interface StrapiCollectionResponse<T> {
  data?: Array<{
    id?: number | string;
    attributes?: T;
  } & T>;
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
  params.set('filters[user][id][$eq]', String(userId));
  params.set('pagination[pageSize]', '1');
  return strapiFetch<StrapiCollectionResponse<AccountNostrKeyResponse>>(
    `/api/nostr-keys?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  )
    .then((response) => {
      const firstEntry = response?.data?.[0];
      const attributes =
        (firstEntry && 'attributes' in firstEntry && firstEntry.attributes
          ? firstEntry.attributes
          : firstEntry) ?? null;
      if (!attributes || typeof attributes !== 'object') {
        return null;
      }
      const record = attributes as Record<string, unknown>;
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
