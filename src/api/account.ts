import { strapiFetch } from './strapi-client';

export interface UpdateLightningAddressResponse {
  id: number;
  email: string;
  username?: string;
  lnWalletAddress?: string | null;
  lightningAddress?: string | null;
  screenName?: string | null;
  avatarUrl?: string | null;
  commissionBtcAddress?: string | null;
}

export interface UpdateProfileSettingsPayload {
  lnWalletAddress?: string | null;
  screenName?: string | null;
  avatarUrl?: string | null;
}

export interface UpdateMePayload {
  commissionBtcAddress?: string | null;
}

export async function updateProfileSettings(
  userId: number,
  jwt: string,
  payload: UpdateProfileSettingsPayload,
): Promise<UpdateLightningAddressResponse> {
  return strapiFetch<UpdateLightningAddressResponse>(`/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function updateCurrentUser(
  jwt: string,
  payload: UpdateMePayload,
): Promise<UpdateLightningAddressResponse> {
  return strapiFetch<UpdateLightningAddressResponse>('/api/profile', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(payload),
  });
}
