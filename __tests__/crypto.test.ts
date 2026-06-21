/* @vitest-environment node */
import { describe, expect, it } from 'vitest';

import { decryptJson, encryptJson, JournalCryptoError } from '../src/lib/crypto';

describe('journal crypto utilities', () => {
  it('encrypts and decrypts JSON with the same secret', async () => {
    const secret = 'correct horse battery staple';
    const entry = {
      title: 'Private note',
      body: 'This plaintext should never be sent to Supabase.',
      mood: 'focused',
    };

    const encrypted = await encryptJson(entry, secret);
    const decrypted = await decryptJson<typeof entry>(
      encrypted.encrypted_payload,
      encrypted.encryption_salt,
      encrypted.iv,
      secret,
    );

    expect(decrypted).toEqual(entry);
    expect(encrypted.encrypted_payload).not.toContain(entry.body);
    expect(encrypted.version).toBe(1);
  });

  it('uses a fresh salt and IV for each encryption', async () => {
    const secret = 'session-only journal secret';
    const entry = { body: 'Same payload' };

    const first = await encryptJson(entry, secret);
    const second = await encryptJson(entry, secret);

    expect(second.encryption_salt).not.toBe(first.encryption_salt);
    expect(second.iv).not.toBe(first.iv);
    expect(second.encrypted_payload).not.toBe(first.encrypted_payload);
  });

  it('rejects decryption with the wrong secret', async () => {
    const encrypted = await encryptJson({ body: 'Private' }, 'right secret');

    await expect(
      decryptJson(
        encrypted.encrypted_payload,
        encrypted.encryption_salt,
        encrypted.iv,
        'wrong secret',
      ),
    ).rejects.toMatchObject({
      code: 'decryption_failed',
    } satisfies Partial<JournalCryptoError>);
  });

  it('rejects corrupted encrypted payloads', async () => {
    const encrypted = await encryptJson({ body: 'Private' }, 'secret');
    const corruptedPayload = `${encrypted.encrypted_payload.slice(0, -2)}AA`;

    await expect(
      decryptJson(
        corruptedPayload,
        encrypted.encryption_salt,
        encrypted.iv,
        'secret',
      ),
    ).rejects.toMatchObject({
      code: 'decryption_failed',
    } satisfies Partial<JournalCryptoError>);
  });
});
