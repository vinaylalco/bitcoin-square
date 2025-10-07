import type { EventTemplate } from "nostr-tools";

import { clear, createStore, del, set, values } from "./keyValueStore";

export interface PendingEvent {
  id: string;
  roomId: string;
  template: EventTemplate;
  createdAt: number;
  retries?: number;
}

const pendingStore = createStore("nostr-chat", "pending-events");

export const queuePendingEvent = async (event: PendingEvent) => {
  await set(event.id, event, pendingStore);
  if (typeof window !== "undefined") {
    await registerBackgroundSync();
  }
};

export const getPendingEvents = async (): Promise<PendingEvent[]> => {
  const entries = await values<PendingEvent>(pendingStore);
  return entries.sort((a, b) => a.createdAt - b.createdAt);
};

export const removePendingEvent = async (id: string) => {
  await del(id, pendingStore);
};

export const clearPendingEvents = async () => {
  await clear(pendingStore);
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
