export interface PinnedEntry {
  id: string;
  pinnedAt: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const PIN_EVENT_KIND = 30001;

const getStorage = (storage?: StorageLike | null): StorageLike | null => {
  if (storage) {
    return storage;
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch (error) {
    console.warn("Pinned entry storage unavailable", error);
    return null;
  }
};

const normalizePinnedAt = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Date.now();
};

const toPinnedEntry = (value: unknown): PinnedEntry | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const { id, pinnedAt } = value as { id?: unknown; pinnedAt?: unknown };
  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }
  return {
    id,
    pinnedAt: normalizePinnedAt(pinnedAt),
  } satisfies PinnedEntry;
};

export const normalizePinnedEntries = (input: unknown): PinnedEntry[] => {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map(toPinnedEntry)
    .filter((entry): entry is PinnedEntry => Boolean(entry))
    .sort((a, b) => a.pinnedAt - b.pinnedAt);
};

export const loadPinnedEntries = (storageKey: string, storage?: StorageLike | null): PinnedEntry[] => {
  const store = getStorage(storage);
  if (!store) {
    return [];
  }
  try {
    const raw = store.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return normalizePinnedEntries(parsed);
  } catch (error) {
    console.warn(`Failed to load pinned entries for ${storageKey}`, error);
    return [];
  }
};

export const persistPinnedEntries = (
  storageKey: string,
  entries: PinnedEntry[],
  storage?: StorageLike | null,
) => {
  const store = getStorage(storage);
  if (!store) {
    return;
  }
  try {
    store.setItem(storageKey, JSON.stringify(entries));
  } catch (error) {
    console.warn(`Failed to persist pinned entries for ${storageKey}`, error);
  }
};

export const togglePinnedEntry = (
  entries: PinnedEntry[],
  id: string,
  pinnedAt: number = Date.now(),
): PinnedEntry[] => {
  if (entries.length === 1 && entries[0].id === id) {
    return entries;
  }
  return [{ id, pinnedAt } satisfies PinnedEntry];
};

export const removePinnedEntry = (entries: PinnedEntry[], id: string): PinnedEntry[] => {
  const next = entries.filter((entry) => entry.id !== id);
  return next.length === entries.length ? entries : next;
};

export const arePinnedEntriesEqual = (a: PinnedEntry[], b: PinnedEntry[]): boolean => {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (left.id !== right.id || left.pinnedAt !== right.pinnedAt) {
      return false;
    }
  }
  return true;
};

export const encodePinnedEventContent = (entries: PinnedEntry[]): string =>
  JSON.stringify({ entries });

export const decodePinnedEventContent = (content: string): PinnedEntry[] => {
  if (typeof content !== "string" || content.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      return normalizePinnedEntries(parsed);
    }
    if (parsed && typeof parsed === "object") {
      const { entries } = parsed as { entries?: unknown };
      return normalizePinnedEntries(entries);
    }
  } catch (error) {
    console.warn("Failed to decode pinned entries", error);
  }
  return [];
};
