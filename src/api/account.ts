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

export interface UpdateMyProfilePayload {
  commissionBtcAddress?: string | null;
}

export async function updateProfileSettings(
  jwt: string,
  payload: UpdateProfileSettingsPayload,
): Promise<UpdateLightningAddressResponse> {
  return strapiFetch<UpdateLightningAddressResponse>('/api/profile', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function getMyProfile(
  jwt: string,
): Promise<UpdateLightningAddressResponse> {
  return strapiFetch<UpdateLightningAddressResponse>('/api/profile', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  });
}

export async function updateMyProfile(
  jwt: string,
  payload: UpdateMyProfilePayload,
): Promise<UpdateLightningAddressResponse> {
  return strapiFetch<UpdateLightningAddressResponse>('/api/profile', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(payload),
  });
}
