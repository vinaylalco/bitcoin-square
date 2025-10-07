const hasIndexedDb = typeof indexedDB !== "undefined";

export interface KeyValueStore {
  dbName: string;
  storeName: string;
}

const buildDbName = (dbName: string, storeName: string) => `${dbName}::${storeName}`;

const fallbackStores = new Map<string, Map<string, unknown>>();
const dbPromises = new Map<string, Promise<IDBDatabase>>();

const getFallbackStore = (store: KeyValueStore) => {
  const key = `${store.dbName}|${store.storeName}`;
  let map = fallbackStores.get(key);
  if (!map) {
    map = new Map<string, unknown>();
    fallbackStores.set(key, map);
  }
  return map;
};

const openDatabase = (store: KeyValueStore): Promise<IDBDatabase> => {
  if (!hasIndexedDb) {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }

  const cacheKey = `${store.dbName}`;
  let promise = dbPromises.get(cacheKey);
  if (!promise) {
    promise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(store.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(store.storeName)) {
          db.createObjectStore(store.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    });
    dbPromises.set(cacheKey, promise);
  }
  return promise;
};

const runTransaction = async <T>(
  store: KeyValueStore,
  mode: IDBTransactionMode,
  operation: (objectStore: IDBObjectStore) => T | Promise<T>,
): Promise<T> => {
  const db = await openDatabase(store);
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store.storeName, mode);
    const objectStore = tx.objectStore(store.storeName);
    const result = operation(objectStore);

    Promise.resolve(result)
      .then((value) => {
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      })
      .catch((error) => {
        reject(error);
      });
  });
};

export const createStore = (dbName: string, storeName: string): KeyValueStore => ({
  dbName: buildDbName(dbName, storeName),
  storeName,
});

export const get = async <T>(key: string, store: KeyValueStore): Promise<T | undefined> => {
  if (!hasIndexedDb) {
    const fallback = getFallbackStore(store);
    return fallback.get(key) as T | undefined;
  }

  try {
    return await runTransaction(store, "readonly", (objectStore) => {
      return new Promise<T | undefined>((resolve, reject) => {
        const request = objectStore.get(key);
        request.onsuccess = () => resolve(request.result as T | undefined);
        request.onerror = () => reject(request.error ?? new Error("Failed to read value"));
      });
    });
  } catch (error) {
    console.warn("IndexedDB get failed, falling back to in-memory store", error);
    const fallback = getFallbackStore(store);
    return fallback.get(key) as T | undefined;
  }
};

export const set = async <T>(key: string, value: T, store: KeyValueStore): Promise<void> => {
  if (!hasIndexedDb) {
    const fallback = getFallbackStore(store);
    fallback.set(key, value);
    return;
  }

  try {
    await runTransaction(store, "readwrite", (objectStore) => {
      objectStore.put(value as unknown, key);
    });
  } catch (error) {
    console.warn("IndexedDB set failed, storing value in memory", error);
    const fallback = getFallbackStore(store);
    fallback.set(key, value);
  }
};

export const del = async (key: string, store: KeyValueStore): Promise<void> => {
  if (!hasIndexedDb) {
    const fallback = getFallbackStore(store);
    fallback.delete(key);
    return;
  }

  try {
    await runTransaction(store, "readwrite", (objectStore) => {
      objectStore.delete(key);
    });
  } catch (error) {
    console.warn("IndexedDB delete failed, clearing from memory", error);
    const fallback = getFallbackStore(store);
    fallback.delete(key);
  }
};

export const clear = async (store: KeyValueStore): Promise<void> => {
  if (!hasIndexedDb) {
    const fallback = getFallbackStore(store);
    fallback.clear();
    return;
  }

  try {
    await runTransaction(store, "readwrite", (objectStore) => {
      objectStore.clear();
    });
  } catch (error) {
    console.warn("IndexedDB clear failed, clearing memory store", error);
    const fallback = getFallbackStore(store);
    fallback.clear();
  }
};

export const values = async <T>(store: KeyValueStore): Promise<T[]> => {
  if (!hasIndexedDb) {
    const fallback = getFallbackStore(store);
    return Array.from(fallback.values()) as T[];
  }

  try {
    return await runTransaction(store, "readonly", (objectStore) => {
      return new Promise<T[]>((resolve, reject) => {
        const request = objectStore.getAll();
        request.onsuccess = () => resolve((request.result ?? []) as T[]);
        request.onerror = () => reject(request.error ?? new Error("Failed to read values"));
      });
    });
  } catch (error) {
    console.warn("IndexedDB values failed, returning memory entries", error);
    const fallback = getFallbackStore(store);
    return Array.from(fallback.values()) as T[];
  }
};
