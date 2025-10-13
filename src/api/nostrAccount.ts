import { getStrapiBaseUrl, strapiFetch } from './strapi-client';

export interface AccountNostrKeyResponse {
  nostrPublicKey?: string;
  nostrPrivateKey?: string;
  nostrEncryptedKey?: string;
}

export function fetchAccountNostrKeys(
  userId: number,
  jwt: string,
): Promise<AccountNostrKeyResponse | null> {
  if (!getStrapiBaseUrl()) {
    return Promise.resolve(null);
  }
  return strapiFetch<AccountNostrKeyResponse>(`/api/users/${userId}/nostr-keys`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  });
}
