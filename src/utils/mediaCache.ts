interface LocalForageInstance {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<T>;
  removeItem(key: string): Promise<void>;
}

type LocalForageModule = {
  createInstance(options: { name: string; storeName: string }): LocalForageInstance;
};

let localforagePromise: Promise<LocalForageModule> | null = null;
let blobStore: LocalForageInstance | null = null;
let previewStore: LocalForageInstance | null = null;

const loadLocalForage = async (): Promise<LocalForageModule> => {
  if (!localforagePromise) {
    localforagePromise = import(
      /* @vite-ignore */ "https://esm.sh/localforage@1.10.0?bundle"
    ) as Promise<LocalForageModule>;
  }
  return localforagePromise;
};

const getBlobStore = async () => {
  if (blobStore) return blobStore;
  const { createInstance } = await loadLocalForage();
  blobStore = createInstance({ name: "nostr-chat-media", storeName: "media-blobs" });
  return blobStore;
};

const getPreviewStore = async () => {
  if (previewStore) return previewStore;
  const { createInstance } = await loadLocalForage();
  previewStore = createInstance({ name: "nostr-chat-media", storeName: "media-previews" });
  return previewStore;
};

export const buildMediaCacheKey = (roomId: string, identifier: string) => `${roomId}|${identifier}`;

export const getCachedMediaBlob = async (roomId: string, identifier: string) => {
  const store = await getBlobStore();
  const key = buildMediaCacheKey(roomId, identifier);
  return store.getItem<Blob>(key);
};

export const setCachedMediaBlob = async (roomId: string, identifier: string, blob: Blob) => {
  const store = await getBlobStore();
  const key = buildMediaCacheKey(roomId, identifier);
  await store.setItem(key, blob);
};

export const getCachedPreview = async (roomId: string, identifier: string) => {
  const store = await getPreviewStore();
  const key = buildMediaCacheKey(roomId, identifier);
  return store.getItem<string>(key);
};

export const setCachedPreview = async (roomId: string, identifier: string, dataUrl: string) => {
  const store = await getPreviewStore();
  const key = buildMediaCacheKey(roomId, identifier);
  await store.setItem(key, dataUrl);
};

export const removeCachedMedia = async (roomId: string, identifier: string) => {
  const blob = await getBlobStore();
  const preview = await getPreviewStore();
  const key = buildMediaCacheKey(roomId, identifier);
  await blob.removeItem(key);
  await preview.removeItem(key);
};
