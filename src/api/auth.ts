import { strapiFetch } from './strapi-client';

export interface AuthResponse {
  jwt: string;
  user: {
    id: number;
    email: string;
    username?: string;
    nostrPublicKey?: string;
    nostrEncryptedKey?: string;
    points?: number | null;
    lessonCompletions?: Record<string, unknown> | null;
  };
}

export function register(email: string, password: string) {
  return strapiFetch<AuthResponse>('/api/auth/local/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, username: email }),
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
