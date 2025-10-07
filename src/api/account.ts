import { strapiFetch } from './strapi-client';

export interface UpdateLightningAddressResponse {
  id: number;
  email: string;
  username?: string;
  lnWalletAddress?: string | null;
  lightningAddress?: string | null;
}

export async function updateLightningAddress(
  userId: number,
  jwt: string,
  lightningAddress: string | null,
): Promise<UpdateLightningAddressResponse> {
  return strapiFetch<UpdateLightningAddressResponse>(`/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ lnWalletAddress: lightningAddress }),
  });
}
