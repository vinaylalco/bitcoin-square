import { StrapiRequestError } from '../api/strapi-client';

export type StrapiAuthErrorCode =
  | 'email_taken'
  | 'invalid_credentials'
  | 'invalid_code'
  | 'discount_expired'
  | 'generic';

export interface StrapiAuthError {
  code: StrapiAuthErrorCode;
  message?: string;
}

function extractMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof StrapiRequestError) {
    if (error.message?.trim()) {
      return error.message.trim();
    }
    const payload = error.payload as { error?: { message?: string }; message?: string } | undefined;
    const payloadMessage = payload?.error?.message ?? payload?.message;
    if (typeof payloadMessage === 'string' && payloadMessage.trim()) {
      return payloadMessage.trim();
    }
  }
  if (error instanceof Error) {
    return error.message?.trim() || null;
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return null;
}

export function resolveStrapiAuthError(error: unknown): StrapiAuthError {
  const message = extractMessage(error);
  if (!message) {
    return { code: 'generic' };
  }

  const normalized = message.toLowerCase();

  if (normalized.includes('email') && normalized.includes('taken')) {
    return { code: 'email_taken' };
  }

  if (normalized.includes('invalid identifier') || normalized.includes('invalid credentials')) {
    return { code: 'invalid_credentials' };
  }

  if (
    normalized.includes('invalid verification code') ||
    (normalized.includes('invalid') && normalized.includes('verification code')) ||
    (normalized.includes('invalid code') && normalized.includes('verification')) ||
    normalized.includes('invalid or expired code') ||
    normalized.includes('expired code')
  ) {
    return { code: 'invalid_code' };
  }

  if (normalized.includes('discount') && normalized.includes('expired')) {
    return { code: 'discount_expired' };
  }

  return { code: 'generic', message };
}
