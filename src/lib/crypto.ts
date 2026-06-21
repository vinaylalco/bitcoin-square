export const JOURNAL_ENCRYPTION_VERSION = 1;
const KEY_DERIVATION_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export type JournalCryptoErrorCode =
  | 'missing_secret'
  | 'invalid_payload'
  | 'decryption_failed';

export class JournalCryptoError extends Error {
  code: JournalCryptoErrorCode;

  constructor(code: JournalCryptoErrorCode, message: string) {
    super(message);
    this.name = 'JournalCryptoError';
    this.code = code;
  }
}

export interface EncryptedJournalPayload {
  encrypted_payload: string;
  encryption_salt: string;
  iv: string;
  version: typeof JOURNAL_ENCRYPTION_VERSION;
}

function assertSecret(secret: string): void {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new JournalCryptoError(
      'missing_secret',
      'A journal secret is required to encrypt or decrypt journal data.',
    );
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new JournalCryptoError(
      'invalid_payload',
      'Encrypted journal data is not valid base64.',
    );
  }
}

async function deriveJournalKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const encodedSecret = new TextEncoder().encode(secret);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encodedSecret,
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: KEY_DERIVATION_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(
  data: unknown,
  secret: string,
): Promise<EncryptedJournalPayload> {
  assertSecret(secret);

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveJournalKey(secret, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );

  return {
    encrypted_payload: bytesToBase64(new Uint8Array(encrypted)),
    encryption_salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    version: JOURNAL_ENCRYPTION_VERSION,
  };
}

export async function decryptJson<T = unknown>(
  encryptedPayload: string,
  salt: string,
  iv: string,
  secret: string,
): Promise<T> {
  assertSecret(secret);

  const encryptedBytes = base64ToBytes(encryptedPayload);
  const saltBytes = base64ToBytes(salt);
  const ivBytes = base64ToBytes(iv);
  const key = await deriveJournalKey(secret, saltBytes);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      key,
      encryptedBytes,
    );
  } catch {
    throw new JournalCryptoError(
      'decryption_failed',
      'Unable to decrypt journal data. The secret may be wrong or the encrypted payload may be corrupted.',
    );
  }

  try {
    return JSON.parse(new TextDecoder().decode(decrypted)) as T;
  } catch {
    throw new JournalCryptoError(
      'decryption_failed',
      'Unable to decode decrypted journal data. The encrypted payload may be corrupted.',
    );
  }
}
