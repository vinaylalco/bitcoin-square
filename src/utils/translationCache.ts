import { createStore, get, set } from "./keyValueStore";

export type CachedTranslation = {
  translatedText: string;
  detectedLanguage?: string;
  provider?: string;
  updatedAt: number;
};

const translationStore = createStore("nostr-chat-translations", "message-translations");

export const buildTranslationKey = (roomId: string, messageId: string, language: string) =>
  `${roomId}|${messageId}|${language}`;

export const getCachedTranslation = async (
  roomId: string,
  messageId: string,
  language: string,
): Promise<CachedTranslation | null> => {
  const key = buildTranslationKey(roomId, messageId, language);
  const result = await get<CachedTranslation>(key, translationStore);
  return result ?? null;
};

export const setCachedTranslation = async (
  roomId: string,
  messageId: string,
  language: string,
  value: Omit<CachedTranslation, "updatedAt">,
): Promise<void> => {
  const key = buildTranslationKey(roomId, messageId, language);
  await set(key, { ...value, updatedAt: Date.now() }, translationStore);
};
