import type { EventTemplate } from "nostr-tools";

type KeyValModule = typeof import("idb-keyval");

export interface PendingEvent {
  id: string;
  roomId: string;
  template: EventTemplate;
  createdAt: number;
  retries?: number;
}

let keyValPromise: Promise<KeyValModule> | null = null;
let pendingStore: Awaited<ReturnType<KeyValModule["createStore"]>> | null = null;

const loadKeyVal = async (): Promise<KeyValModule> => {
  if (!keyValPromise) {
    keyValPromise = import(
      /* @vite-ignore */ "https://esm.sh/idb-keyval@6.3.1?bundle"
    ) as Promise<KeyValModule>;
  }
  return keyValPromise;
};

const getPendingStore = async () => {
  if (pendingStore) return pendingStore;
  const { createStore } = await loadKeyVal();
  pendingStore = createStore("nostr-chat", "pending-events");
  return pendingStore;
};

export const queuePendingEvent = async (event: PendingEvent) => {
  const { set } = await loadKeyVal();
  const store = await getPendingStore();
  await set(event.id, event, store);
  if (typeof window !== "undefined") {
    await registerBackgroundSync();
  }
};

export const getPendingEvents = async (): Promise<PendingEvent[]> => {
  const { values } = await loadKeyVal();
  const store = await getPendingStore();
  const entries = await values<PendingEvent>(store);
  return entries.sort((a, b) => a.createdAt - b.createdAt);
};

export const removePendingEvent = async (id: string) => {
  const { del } = await loadKeyVal();
  const store = await getPendingStore();
  await del(id, store);
};

export const clearPendingEvents = async () => {
  const { clear } = await loadKeyVal();
  const store = await getPendingStore();
  await clear(store);
};

export const flushPendingEvents = async (
  publisher: (template: EventTemplate) => Promise<{ id: string }>,
) => {
  const pending = await getPendingEvents();
  const results: Array<{
    pendingId: string;
    eventId?: string;
    error?: string;
    template: EventTemplate;
  }> = [];
  for (const entry of pending) {
    try {
      const result = await publisher(entry.template);
      if (result?.id) {
        await removePendingEvent(entry.id);
        results.push({ pendingId: entry.id, eventId: result.id, template: entry.template });
      }
    } catch (error) {
      console.warn("Background publish failed", error);
      results.push({
        pendingId: entry.id,
        error: error instanceof Error ? error.message : String(error),
        template: entry.template,
      });
    }
  }
  return results;
};

export const registerBackgroundSync = async () => {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!("SyncManager" in window)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.sync.register("nostr-chat-sync");
  } catch (error) {
    console.warn("Failed to register background sync", error);
  }
};
