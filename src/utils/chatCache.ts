import { createStore, get, set } from "./keyValueStore";

export interface CachedMessage {
  id: string;
  roomId: string;
  pubkey: string;
  content: string;
  decrypted?: string;
  created_at: number;
  kind?: number;
  tags?: string[][];
  sig?: string;
}

const MESSAGE_LIMIT = 200;
const messageStore = createStore("nostr-chat", "room-messages");

const readMessages = async (key: string) => {
  try {
    const existing = await get<CachedMessage[]>(key, messageStore);
    if (!Array.isArray(existing)) {
      return [];
    }
    return existing.filter(Boolean);
  } catch (error) {
    console.warn("Failed to read cached messages", error);
    return [];
  }
};

const dedupeAndSort = (messages: CachedMessage[]): CachedMessage[] => {
  const unique = new Map<string, CachedMessage>();
  messages.forEach((message) => {
    unique.set(message.id, message);
  });
  return Array.from(unique.values()).sort((a, b) => a.created_at - b.created_at);
};

export const cacheMessage = async (message: CachedMessage) => {
  const key = `room:${message.roomId}`;
  const existing = await readMessages(key);
  const updated = dedupeAndSort([...existing, message]).slice(-MESSAGE_LIMIT);
  await set(key, updated, messageStore);
};

export const cacheMessages = async (roomId: string, batch: CachedMessage[]) => {
  if (batch.length === 0) return;
  const key = `room:${roomId}`;
  const existing = await readMessages(key);
  const updated = dedupeAndSort([...existing, ...batch]).slice(-MESSAGE_LIMIT);
  await set(key, updated, messageStore);
};

export const getCachedMessages = async (roomId: string, limit = MESSAGE_LIMIT) => {
  const key = `room:${roomId}`;
  const messages = await readMessages(key);
  return messages.slice(-limit);
};

export const preloadRoomsMessages = async (roomIds: string[], limit = 20) => {
  const results = new Map<string, CachedMessage[]>();
  await Promise.all(
    roomIds.map(async (roomId) => {
      const messages = await getCachedMessages(roomId, limit);
      if (messages.length > 0) {
        results.set(roomId, messages);
      }
    }),
  );
  return results;
};

export const removeCachedMessages = async (roomId: string, ids: string[]) => {
  if (ids.length === 0) return;
  const key = `room:${roomId}`;
  const existing = await readMessages(key);
  if (existing.length === 0) return;
  const targetIds = new Set(ids);
  const filtered = existing.filter((message) => !targetIds.has(message.id));
  if (filtered.length === existing.length) {
    return;
  }
  await set(key, filtered, messageStore);
};
