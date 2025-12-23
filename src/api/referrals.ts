import { strapiFetch } from './strapi-client';

export interface CreateReferralPayload {
  referrerId: string;
  referredUserId: number;
}

export async function createReferral(payload: CreateReferralPayload) {
  const { referrerId, referredUserId } = payload;

  return strapiFetch('/api/referrals', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        referrerId,
        referredUserId,
      },
    }),
  });
}
