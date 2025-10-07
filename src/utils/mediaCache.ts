import { createStore, del, get, set } from "./keyValueStore";

const blobStore = createStore("nostr-chat-media", "media-blobs");
const previewStore = createStore("nostr-chat-media", "media-previews");

export const buildMediaCacheKey = (roomId: string, identifier: string) => `${roomId}|${identifier}`;

export const getCachedMediaBlob = async (roomId: string, identifier: string) => {
  const key = buildMediaCacheKey(roomId, identifier);
  const result = await get<Blob>(key, blobStore);
  return result ?? null;
};

export const setCachedMediaBlob = async (roomId: string, identifier: string, blob: Blob) => {
  const key = buildMediaCacheKey(roomId, identifier);
  await set(key, blob, blobStore);
};

export const getCachedPreview = async (roomId: string, identifier: string) => {
  const key = buildMediaCacheKey(roomId, identifier);
  const result = await get<string>(key, previewStore);
  return result ?? null;
};

export const setCachedPreview = async (roomId: string, identifier: string, dataUrl: string) => {
  const key = buildMediaCacheKey(roomId, identifier);
  await set(key, dataUrl, previewStore);
};

export const removeCachedMedia = async (roomId: string, identifier: string) => {
  const key = buildMediaCacheKey(roomId, identifier);
  await Promise.all([del(key, blobStore), del(key, previewStore)]);
};
