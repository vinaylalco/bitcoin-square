# Nostr Chat Caching Architecture

## Pseudocode Overview

```text
App start:
  load room list from localStorage
  preload last 20 cached messages per room via idb-keyval store
  render chat UI with prefetched messages for instant paint

ChatRoom mount:
  hydrate state from prefetched cache (if available)
  subscribe to room events via nostrClient
  for each incoming event:
    -> normalize to ChatMessage (text or media)
    -> persist in idb-keyval store for offline access
    -> if media message
         load preview from localForage (if cached)
         else fetch binary, decrypt (if private), cache blob + preview
         update UI from "preview" to "full" view when ready

Sending messages:
  optimistic append to UI
  if offline -> queue event in pending store + register background sync
  service worker sync event notifies clients to flush queue when back online
```

## Key Modules

```tsx
// ChatRoom.tsx
useEffect(() => {
  preloadRoomsMessages(roomIds, 20);
  nostrClient.subscribeToRoom(room.id, handleIncomingEvent);
}, [room.id]);

const handleIncomingEvent = async (event: Event) => {
  const message = await eventToMessage(event);
  setMessages((prev) => insertSorted(prev, message));
  await cacheMessage({ ...event, decrypted: message.content });
};

// media processing pipeline
if (message.content.type === "media") {
  const preview = await getCachedPreview(room.id, digest);
  const blob = await getCachedMediaBlob(room.id, digest) ?? await downloadAndDecrypt();
  await setCachedMediaBlob(room.id, digest, blob);
  await setCachedPreview(room.id, digest, preview);
  updateMessage({ previewUrl: preview, fullUrl: URL.createObjectURL(blob) });
}
```

```ts
// workers/mediaWorker.ts
self.addEventListener("message", async (event) => {
  const { file, encrypt } = event.data;
  const compressed = file.type.startsWith("image/") ? await imageCompression(file) : file;
  const digest = sha256(compressed);
  const { buffer, iv } = encrypt ? await aesGcmEncrypt(compressed, encrypt.key) : { buffer: await compressed.arrayBuffer() };
  const preview = await createThumbnail(compressed);
  postMessage({ digest, buffer, preview, iv }, [buffer, iv?.buffer].filter(Boolean));
});
```

```ts
// utils/backgroundSync.ts
export const queuePendingEvent = async (event: PendingEvent) => {
  await set(event.id, event, pendingStore);
  await registerBackgroundSync();
};

export const flushPendingEvents = async (publisher) => {
  const pending = await values(pendingStore);
  return Promise.all(pending.map(async (entry) => {
    const result = await publisher(entry.template);
    await del(entry.id, pendingStore);
    return { pendingId: entry.id, eventId: result.id, template: entry.template };
  }));
};
```

```ts
// public/nostr-sw.js
self.addEventListener("sync", (event) => {
  if (event.tag === "nostr-chat-sync") {
    event.waitUntil(notifyClients("nostr-sync"));
  }
});
```

```tsx
// hooks/useMediaUploader.ts
const workerResult = await runWorker(file, { encryptKey, preview: true });
const payload = new Blob([workerResult.buffer], { type: workerResult.mimeType });
await setCachedMediaBlob(roomId, workerResult.digest, new Blob([workerResult.originalBuffer], { type: file.type }));
await setCachedPreview(roomId, workerResult.digest, workerResult.previewDataUrl);
```

