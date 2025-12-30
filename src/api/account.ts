import { StrapiResponse, strapiFetch } from './strapi-client';

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

export type UpdateMyProfileResponse =
  | UpdateLightningAddressResponse
  | StrapiResponse<UpdateLightningAddressResponse>;

export async function updateProfileSettings(
  jwt: string,
  payload: UpdateProfileSettingsPayload,
): Promise<StrapiResponse<UpdateLightningAddressResponse>> {
  return strapiFetch<StrapiResponse<UpdateLightningAddressResponse>>('/api/profile', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ data: payload }),
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
): Promise<UpdateMyProfileResponse> {
  return strapiFetch<UpdateMyProfileResponse>('/api/profile', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}
