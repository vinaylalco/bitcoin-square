import { nip04, nip44 } from "nostr-tools";

const DM_PREFIX = "v44";
const CHANNEL_PREFIX = "v44";

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
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
};

const wrap = (prefix: string, ciphertext: string) => `${prefix}:${ciphertext}`;
const unwrap = (prefix: string, payload: string) => payload.slice(prefix.length + 1);

export const encryptDirectMessage = async (
  privkeyHex: string,
  peerPubkey: string,
  plaintext: string,
): Promise<string> => {
  const normalized = normalizeHex(privkeyHex);
  const conversationKey = nip44.getConversationKey(hexToBytes(normalized), peerPubkey);
  const ciphertext = nip44.encrypt(plaintext, conversationKey);
  return wrap(DM_PREFIX, ciphertext);
};

export const decryptDirectMessage = async (
  privkeyHex: string,
  peerPubkey: string,
  payload: string,
): Promise<string> => {
  const normalized = normalizeHex(privkeyHex);
  if (payload.startsWith(`${DM_PREFIX}:`)) {
    try {
      const conversationKey = nip44.getConversationKey(hexToBytes(normalized), peerPubkey);
      return nip44.decrypt(unwrap(DM_PREFIX, payload), conversationKey);
    } catch (error) {
      console.warn("Failed to decrypt nip44 DM payload", error);
    }
  }
  return nip04.decrypt(normalized, peerPubkey, payload);
};

export const encryptChannelPayload = async (
  roomKeyBase64: string,
  plaintext: string,
): Promise<string> => {
  const normalized = roomKeyBase64.trim();
  if (!normalized) {
    throw new Error("Room key cannot be empty");
  }
  const conversationKey = Uint8Array.from(Buffer.from(normalized, "base64"));
  const ciphertext = nip44.encrypt(plaintext, conversationKey);
  return wrap(CHANNEL_PREFIX, ciphertext);
};

export const decryptChannelPayload = async (
  roomKeyBase64: string,
  payload: string,
): Promise<string> => {
  const normalized = roomKeyBase64.trim();
  if (!normalized) {
    throw new Error("Room key cannot be empty");
  }
  const conversationKey = Uint8Array.from(Buffer.from(normalized, "base64"));
  if (payload.startsWith(`${CHANNEL_PREFIX}:`)) {
    return nip44.decrypt(unwrap(CHANNEL_PREFIX, payload), conversationKey);
  }
  return payload;
};
