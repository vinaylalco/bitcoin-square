import { strapiFetch } from './strapi-client';

export interface RegisterOptions {
  txHash?: string;
}

export interface AuthResponse {
  jwt: string;
  user: {
    id: number;
    email: string;
    username?: string;
    nostrPublicKey?: string;
    nostrEncryptedKey?: string;
    lnWalletAddress?: string | null;
    lightningAddress?: string | null;
    points?: number | null;
    lessonCompletions?: Record<string, unknown> | null;
    studyStreak?: number | null;
    lastStudyDate?: string | null;
  };
}

export function register(email: string, password: string, options: RegisterOptions = {}) {
  const trimmedEmail = email.trim();
  const payload: Record<string, unknown> = {
    email: trimmedEmail,
    username: trimmedEmail,
    password,
    // flow: 'membership',
  };

  if (options.txHash && options.txHash.trim().length > 0) {
    payload.txHash = options.txHash.trim();
  }

  return strapiFetch<AuthResponse>('/api/auth/local/register', {
    method: 'POST',
    headers: {
      'X-Membership-Flow': '1',
    },
    body: JSON.stringify(payload),
  });
}

export function login(email: string, password: string) {
  return strapiFetch<AuthResponse>('/api/auth/local', {
    method: 'POST',
    body: JSON.stringify({ identifier: email, password }),
  });
}

export function forgotPassword(email: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}/reset-password`;
  return strapiFetch<{ ok: boolean }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email, url }),
  });
}

export function resetPassword(code: string, password: string, passwordConfirmation: string) {
  return strapiFetch<AuthResponse>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ code, password, passwordConfirmation }),
  });
}
