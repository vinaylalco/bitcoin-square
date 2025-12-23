import { strapiFetch } from './strapi-client';

export interface RegisterOptions {
  /**
   * @deprecated Transaction hashes must be associated with memberships only.
   */
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

export function register(email: string, password: string, _options: RegisterOptions = {}) {
  const trimmedEmail = email.trim();
  const payload: Record<string, unknown> = {
    email: trimmedEmail,
    username: trimmedEmail,
    password,
    // flow: 'membership',
  };

  return strapiFetch<AuthResponse>('/api/auth/local/register', {
    method: 'POST',
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
  return strapiFetch<{ ok: boolean }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(code: string, password: string, passwordConfirmation: string) {
  return strapiFetch<AuthResponse>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ code, password, passwordConfirmation }),
  });
}
