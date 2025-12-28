import { strapiFetch, StrapiRequestError } from './strapi-client';

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
  const paths = ['/api/users/me', '/api/users/me/profile'];

  const lastPath = paths[paths.length - 1];
  for (const path of paths) {
    try {
      return await strapiFetch<UpdateLightningAddressResponse>(path, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (error instanceof StrapiRequestError && error.status === 404 && path !== lastPath) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Unable to update profile');
}
