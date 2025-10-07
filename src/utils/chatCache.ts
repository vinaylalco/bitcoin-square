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

type KeyValModule = typeof import("idb-keyval");

let keyValPromise: Promise<KeyValModule> | null = null;
let messageStore: Awaited<ReturnType<KeyValModule["createStore"]>> | null = null;

const loadKeyVal = async (): Promise<KeyValModule> => {
  if (!keyValPromise) {
    keyValPromise = import(
      /* @vite-ignore */ "https://esm.sh/idb-keyval@6.3.1?bundle"
    ) as Promise<KeyValModule>;
  }
  return keyValPromise;
};

const getMessageStore = async () => {
  if (messageStore) return messageStore;
  const { createStore } = await loadKeyVal();
  messageStore = createStore("nostr-chat", "room-messages");
  return messageStore;
};

const dedupeAndSort = (messages: CachedMessage[]): CachedMessage[] => {
  const unique = new Map<string, CachedMessage>();
  messages.forEach((message) => {
    unique.set(message.id, message);
  });
  return Array.from(unique.values()).sort((a, b) => a.created_at - b.created_at);
};

export const cacheMessage = async (message: CachedMessage) => {
  const { get, set } = await loadKeyVal();
  const store = await getMessageStore();
  const key = `room:${message.roomId}`;
  const existing = ((await get<CachedMessage[]>(key, store)) ?? []).filter(Boolean);
  const updated = dedupeAndSort([...existing, message]).slice(-MESSAGE_LIMIT);
  await set(key, updated, store);
};

export const cacheMessages = async (roomId: string, batch: CachedMessage[]) => {
  if (batch.length === 0) return;
  const { get, set } = await loadKeyVal();
  const store = await getMessageStore();
  const key = `room:${roomId}`;
  const existing = ((await get<CachedMessage[]>(key, store)) ?? []).filter(Boolean);
  const updated = dedupeAndSort([...existing, ...batch]).slice(-MESSAGE_LIMIT);
  await set(key, updated, store);
};

export const getCachedMessages = async (roomId: string, limit = MESSAGE_LIMIT) => {
  const { get } = await loadKeyVal();
  const store = await getMessageStore();
  const key = `room:${roomId}`;
  const messages = ((await get<CachedMessage[]>(key, store)) ?? []).filter(Boolean);
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
