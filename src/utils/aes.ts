/* eslint-disable no-console */
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const DB_NAME = "nostr-room-keys";
const STORE_NAME = "keys";
const SESSION_PREFIX = "nostr-room-key:";

const globalScope = globalThis as typeof globalThis & {
  sessionStorage?: Storage;
  indexedDB?: IDBFactory;
  crypto?: Crypto;
  msCrypto?: Crypto;
};

const hasSessionStorage = Boolean(globalScope.sessionStorage);
const hasIndexedDb = Boolean(globalScope.indexedDB);

const memoryStore = new Map<string, string>();
let dbPromise: Promise<IDBDatabase> | null = null;

export interface Nip04Handler {
  encrypt: (pubkey: string, plaintext: string) => Promise<string>;
  decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
}

export interface ExportOptions {
  recipientPubkey?: string;
  senderPubkey?: string;
  nip04?: Nip04Handler;
}

export interface ImportOptions {
  senderPubkey?: string;
  nip04?: Nip04Handler;
}

interface RoomKeyEnvelope {
  roomId: string;
  key: string;
  updatedAt: number;
  senderPubkey?: string;
}

const getCrypto = () => {
  const cryptoInstance = globalScope.crypto ?? (globalScope as unknown as { msCrypto?: Crypto }).msCrypto;
  if (!cryptoInstance || !cryptoInstance.subtle) {
    throw new Error("WebCrypto API is not available in this environment");
  }
  return cryptoInstance;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer | ArrayBufferView) => {
  const view = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const bytes = view;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToArrayBuffer = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const openDb = () => {
  if (!hasIndexedDb) {
    return Promise.reject(new Error("IndexedDB is not supported"));
  }

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalScope.indexedDB!.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    });
  }

  return dbPromise;
};

const readFromIndexedDb = async (roomId: string) => {
  if (!hasIndexedDb) return null;
  try {
    const db = await openDb();
    return await new Promise<string | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(roomId);
      request.onsuccess = () => {
        resolve(typeof request.result === "string" ? request.result : null);
      };
      request.onerror = () => {
        reject(request.error ?? new Error("Failed to read room key"));
      };
    });
  } catch (error) {
    console.warn("Failed to read key from IndexedDB", error);
    return null;
  }
};

const writeToIndexedDb = async (roomId: string, value: string) => {
  if (!hasIndexedDb) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, roomId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Failed to persist room key"));
      request.onerror = () => reject(request.error ?? new Error("Failed to persist room key"));
    });
  } catch (error) {
    console.warn("Failed to store key in IndexedDB", error);
  }
};

const deleteFromIndexedDb = async (roomId: string) => {
  if (!hasIndexedDb) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(roomId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Failed to delete room key"));
      request.onerror = () => reject(request.error ?? new Error("Failed to delete room key"));
    });
  } catch (error) {
    console.warn("Failed to delete key from IndexedDB", error);
  }
};

const readFromSession = (roomId: string) => {
  if (!hasSessionStorage) return null;
  try {
    return globalScope.sessionStorage!.getItem(`${SESSION_PREFIX}${roomId}`);
  } catch (error) {
    console.warn("Failed to read key from sessionStorage", error);
    return null;
  }
};

const writeToSession = (roomId: string, value: string) => {
  if (!hasSessionStorage) return;
  try {
    globalScope.sessionStorage!.setItem(`${SESSION_PREFIX}${roomId}`, value);
  } catch (error) {
    console.warn("Failed to store key in sessionStorage", error);
  }
};

const deleteFromSession = (roomId: string) => {
  if (!hasSessionStorage) return;
  try {
    globalScope.sessionStorage!.removeItem(`${SESSION_PREFIX}${roomId}`);
  } catch (error) {
    console.warn("Failed to delete key from sessionStorage", error);
  }
};

const getStoredRoomKey = async (roomId: string) => {
  const sessionValue = readFromSession(roomId);
  if (sessionValue) return sessionValue;

  const indexedValue = await readFromIndexedDb(roomId);
  if (indexedValue) {
    writeToSession(roomId, indexedValue);
    return indexedValue;
  }

  return memoryStore.get(roomId) ?? null;
};

const persistRoomKey = async (roomId: string, base64Key: string) => {
  memoryStore.set(roomId, base64Key);
  writeToSession(roomId, base64Key);
  await writeToIndexedDb(roomId, base64Key);
};

const removeRoomKey = async (roomId: string) => {
  memoryStore.delete(roomId);
  deleteFromSession(roomId);
  await deleteFromIndexedDb(roomId);
};

const importKeyFromBase64 = async (base64Key: string) => {
  const cryptoInstance = getCrypto();
  const rawKey = base64ToArrayBuffer(base64Key);
  return cryptoInstance.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt", "decrypt"]);
};

const generateAndStoreRoomKey = async (roomId: string) => {
  const cryptoInstance = getCrypto();
  const key = await cryptoInstance.subtle.generateKey(
    {
      name: "AES-GCM",
      length: KEY_LENGTH,
    },
    true,
    ["encrypt", "decrypt"],
  );
  const exported = await cryptoInstance.subtle.exportKey("raw", key);
  const base64Key = arrayBufferToBase64(exported);
  await persistRoomKey(roomId, base64Key);
  return key;
};

const getRoomKey = async (roomId: string) => {
  const stored = await getStoredRoomKey(roomId);
  if (stored) {
    return importKeyFromBase64(stored);
  }
  return generateAndStoreRoomKey(roomId);
};

export const getRoomCryptoKey = async (roomId: string) => getRoomKey(roomId);

export const getRoomKeyBase64 = async (roomId: string) => {
  const stored = await getStoredRoomKey(roomId);
  if (stored) {
    return stored;
  }

  const cryptoInstance = getCrypto();
  const key = await getRoomKey(roomId);
  const exported = await cryptoInstance.subtle.exportKey("raw", key);
  return arrayBufferToBase64(exported);
};

export const hasRoomKey = async (roomId: string) => {
  const stored = await getStoredRoomKey(roomId);
  return Boolean(stored);
};

export const ensureRoomKey = async (roomId: string) => {
  const exists = await hasRoomKey(roomId);
  if (!exists) {
    await generateAndStoreRoomKey(roomId);
  }
};

export const rotateRoomKey = async (roomId: string) => {
  await removeRoomKey(roomId);
  await generateAndStoreRoomKey(roomId);
};

const buildEnvelope = async (roomId: string, senderPubkey?: string): Promise<RoomKeyEnvelope> => {
  const stored = await getStoredRoomKey(roomId);
  if (!stored) {
    throw new Error(`No key available for room ${roomId}`);
  }
  return {
    roomId,
    key: stored,
    updatedAt: Date.now(),
    senderPubkey,
  };
};

export const exportRoomKey = async (roomId: string, options: ExportOptions = {}) => {
  const envelope = await buildEnvelope(roomId, options.senderPubkey);
  const payload = JSON.stringify(envelope);

  if (options.nip04 && options.recipientPubkey) {
    return options.nip04.encrypt(options.recipientPubkey, payload);
  }

  return payload;
};

export const importRoomKey = async (roomId: string, payload: string, options: ImportOptions = {}) => {
  let decoded = payload;
  if (options.nip04 && options.senderPubkey) {
    decoded = await options.nip04.decrypt(options.senderPubkey, payload);
  }

  const parsed = JSON.parse(decoded) as RoomKeyEnvelope;
  if (!parsed || parsed.roomId !== roomId || !parsed.key) {
    throw new Error("Invalid room key payload");
  }

  await persistRoomKey(roomId, parsed.key);
};

export const forgetRoomKey = async (roomId: string) => {
  await removeRoomKey(roomId);
};

export const encryptMessage = async (roomId: string, plaintext: string) => {
  const cryptoInstance = getCrypto();
  const key = await getRoomKey(roomId);
  const iv = cryptoInstance.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await cryptoInstance.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext));
  return `${arrayBufferToBase64(iv)}:${arrayBufferToBase64(ciphertext)}`;
};

export const decryptMessage = async (roomId: string, ciphertext: string) => {
  const cryptoInstance = getCrypto();
  const key = await getRoomKey(roomId);
  const [ivPart, dataPart] = ciphertext.split(":");
  if (!ivPart || !dataPart) {
    throw new Error("Invalid ciphertext format");
  }
  const iv = new Uint8Array(base64ToArrayBuffer(ivPart));
  const data = base64ToArrayBuffer(dataPart);
  const plaintext = await cryptoInstance.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return decoder.decode(plaintext);
};

export const encryptJson = async (roomId: string, payload: unknown) => {
  const serialized = JSON.stringify(payload);
  return encryptMessage(roomId, serialized);
};

export const decryptJson = async <T>(roomId: string, ciphertext: string): Promise<T> => {
  const plaintext = await decryptMessage(roomId, ciphertext);
  return JSON.parse(plaintext) as T;
};

export const decryptBinary = async (roomId: string, payload: ArrayBuffer, iv: Uint8Array) => {
  const cryptoInstance = getCrypto();
  const key = await getRoomKey(roomId);
  const decrypted = await cryptoInstance.subtle.decrypt({ name: "AES-GCM", iv }, key, payload);
  return decrypted;
};
