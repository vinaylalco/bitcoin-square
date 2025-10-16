import { nip04Decrypt, nip04Encrypt, nip44Decrypt, nip44Encrypt, nip44GetConversationKey } from "../lib/nostrToolsShim";

const DM_PREFIX = "v44";

const normalizeHex = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("A Nostr private key is required for encryption");
  }
  return trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
};

const hexToBytes = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
};

const wrapCiphertext = (ciphertext: string) => `${DM_PREFIX}:${ciphertext}`;
const unwrapCiphertext = (payload: string) => payload.slice(DM_PREFIX.length + 1);

export const encryptDirectMessage = async (
  privkeyHex: string,
  peerPubkey: string,
  plaintext: string,
): Promise<string> => {
  const normalized = normalizeHex(privkeyHex);
  const conversationKey = await nip44GetConversationKey(hexToBytes(normalized), peerPubkey);
  const ciphertext = await nip44Encrypt(plaintext, conversationKey);
  return wrapCiphertext(ciphertext);
};

export const decryptDirectMessage = async (
  privkeyHex: string,
  peerPubkey: string,
  payload: string,
): Promise<string> => {
  const normalized = normalizeHex(privkeyHex);
  if (payload.startsWith(`${DM_PREFIX}:`)) {
    const conversationKey = await nip44GetConversationKey(hexToBytes(normalized), peerPubkey);
    try {
      return await nip44Decrypt(unwrapCiphertext(payload), conversationKey);
    } catch (error) {
      console.warn("nip44 DM decrypt failed, falling back to nip04", error);
    }
  }

  return nip04Decrypt(normalized, peerPubkey, payload);
};

export const encryptLegacyDirectMessage = async (
  privkeyHex: string,
  peerPubkey: string,
  plaintext: string,
): Promise<string> => nip04Encrypt(privkeyHex, peerPubkey, plaintext);
