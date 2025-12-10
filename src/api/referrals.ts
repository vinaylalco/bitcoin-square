import { strapiFetch } from './strapi-client';

export interface CreateReferralPayload {
  referrerId: string;
  referredUserId: number;
  createdAt?: string;
}

export async function createReferral(payload: CreateReferralPayload) {
  return strapiFetch('/api/referrals', {
    method: 'POST',
    body: JSON.stringify({
      data: payload,
    }),
  });
}
