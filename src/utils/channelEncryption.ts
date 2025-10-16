import { nip44Decrypt, nip44Encrypt } from "../lib/nostrToolsShim";
import { decryptJson, decryptMessage, getRoomKeyBase64 } from "./aes";

const CHANNEL_PREFIX = "v44";

const base64ToUint8Array = (value: string): Uint8Array => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Room encryption key cannot be empty");
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const wrapCiphertext = (ciphertext: string) => `${CHANNEL_PREFIX}:${ciphertext}`;
const unwrapCiphertext = (payload: string) => payload.slice(CHANNEL_PREFIX.length + 1);

const getConversationKey = async (roomId: string): Promise<Uint8Array> => {
  const keyBase64 = await getRoomKeyBase64(roomId);
  if (!keyBase64) {
    throw new Error(`No encryption key available for room ${roomId}`);
  }
  return base64ToUint8Array(keyBase64);
};

export const encryptChannelText = async (roomId: string, plaintext: string): Promise<string> => {
  const conversationKey = await getConversationKey(roomId);
  const ciphertext = await nip44Encrypt(plaintext, conversationKey);
  return wrapCiphertext(ciphertext);
};

export const decryptChannelText = async (roomId: string, payload: string): Promise<string> => {
  if (payload.startsWith(`${CHANNEL_PREFIX}:`)) {
    const conversationKey = await getConversationKey(roomId);
    try {
      return await nip44Decrypt(unwrapCiphertext(payload), conversationKey);
    } catch (error) {
      console.warn("nip44 channel decrypt failed, falling back to AES", error);
    }
  }
  return decryptMessage(roomId, payload);
};

export const encryptChannelJson = async (roomId: string, payload: unknown): Promise<string> => {
  const plaintext = JSON.stringify(payload);
  return encryptChannelText(roomId, plaintext);
};

export const decryptChannelJson = async <T>(roomId: string, payload: string): Promise<T> => {
  if (payload.startsWith(`${CHANNEL_PREFIX}:`)) {
    const conversationKey = await getConversationKey(roomId);
    try {
      const plaintext = await nip44Decrypt(unwrapCiphertext(payload), conversationKey);
      return JSON.parse(plaintext) as T;
    } catch (error) {
      console.warn("nip44 channel JSON decrypt failed, falling back to AES", error);
    }
  }
  return decryptJson<T>(roomId, payload);
};
