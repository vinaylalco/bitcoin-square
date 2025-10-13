self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const notifyClients = async (message) => {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  await Promise.all(
    clients.map((client) => client.postMessage(message)),
  );
};

self.addEventListener("sync", (event) => {
  if (event.tag === "nostr-chat-sync") {
    event.waitUntil(notifyClients("nostr-sync"));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "trigger-sync") {
    event.waitUntil(notifyClients("nostr-sync"));
  }
});
