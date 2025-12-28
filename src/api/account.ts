import {
  getStrapiBaseUrl,
  StrapiConfigError,
  StrapiNetworkError,
  strapiFetch,
} from './strapi-client';

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
): Promise<Response> {
  const base = getStrapiBaseUrl();
  if (!base) {
    throw new StrapiConfigError();
  }

  const url = `${base}/api/users/update-me`;

  try {
    return await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new StrapiNetworkError(
      error instanceof Error ? error.message : 'Unknown Strapi fetch error',
    );
  }
}
