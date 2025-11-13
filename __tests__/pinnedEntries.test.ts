/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadPinnedEntries,
  normalizePinnedEntries,
  persistPinnedEntries,
  removePinnedEntry,
  togglePinnedEntry,
  encodePinnedEventContent,
  decodePinnedEventContent,
  type PinnedEntry,
} from "../src/utils/pinnedEntries";

interface MemoryStorage {
  store: Record<string, string>;
  storage: Pick<Storage, "getItem" | "setItem">;
}

const createMemoryStorage = (initial: Record<string, string> = {}): MemoryStorage => {
  const store = { ...initial } as Record<string, string>;
  return {
    store,
    storage: {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    },
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("normalizePinnedEntries", () => {
  it("filters invalid values and sorts by timestamp", () => {
    const now = Date.now();
    const result = normalizePinnedEntries([
      { id: "valid", pinnedAt: 20 },
      { id: "string", pinnedAt: "10" },
      { id: "future", pinnedAt: "not-a-number" },
      { id: "", pinnedAt: 5 },
      null,
      undefined,
      42,
    ]);

    expect(result).toEqual<PinnedEntry[]>([
      { id: "string", pinnedAt: 10 },
      { id: "valid", pinnedAt: 20 },
      { id: "future", pinnedAt: now },
    ]);
  });
});

describe("storage helpers", () => {
  it("loads sanitized entries from storage", () => {
    const now = Date.now();
    const { storage } = createMemoryStorage({
      key: JSON.stringify([
        { id: "first", pinnedAt: 5 },
        { id: "second", pinnedAt: "15" },
        { id: "stale" },
      ]),
    });

    const result = loadPinnedEntries("key", storage);

    expect(result).toEqual<PinnedEntry[]>([
      { id: "first", pinnedAt: 5 },
      { id: "second", pinnedAt: 15 },
      { id: "stale", pinnedAt: now },
    ]);
  });

  it("persists entries into storage", () => {
    const entries: PinnedEntry[] = [
      { id: "one", pinnedAt: 1 },
      { id: "two", pinnedAt: 2 },
    ];
    const { storage, store } = createMemoryStorage();

    persistPinnedEntries("key", entries, storage);

    expect(store.key).toEqual(JSON.stringify(entries));
  });
});

describe("togglePinnedEntry", () => {
  it("adds new entries with sorted order", () => {
    const result = togglePinnedEntry(
      [
        { id: "b", pinnedAt: 20 },
        { id: "c", pinnedAt: 30 },
      ],
      "a",
      10,
    );

    expect(result).toEqual<PinnedEntry[]>([
      { id: "a", pinnedAt: 10 },
      { id: "b", pinnedAt: 20 },
      { id: "c", pinnedAt: 30 },
    ]);
  });

  it("reorders existing entries with a fresh timestamp", () => {
    const result = togglePinnedEntry(
      [
        { id: "a", pinnedAt: 10 },
        { id: "b", pinnedAt: 20 },
      ],
      "a",
      40,
    );

    expect(result).toEqual<PinnedEntry[]>([
      { id: "b", pinnedAt: 20 },
      { id: "a", pinnedAt: 40 },
    ]);
  });
});

describe("removePinnedEntry", () => {
  it("removes existing entries", () => {
    const initial: PinnedEntry[] = [
      { id: "a", pinnedAt: 10 },
      { id: "b", pinnedAt: 20 },
    ];

    const result = removePinnedEntry(initial, "a");

    expect(result).toEqual<PinnedEntry[]>([{ id: "b", pinnedAt: 20 }]);
  });

  it("preserves reference when nothing changes", () => {
    const initial: PinnedEntry[] = [
      { id: "a", pinnedAt: 10 },
    ];

    const result = removePinnedEntry(initial, "missing");

    expect(result).toBe(initial);
  });
});

describe("pinned event content helpers", () => {
  it("encodes entries into JSON payloads", () => {
    const entries: PinnedEntry[] = [
      { id: "one", pinnedAt: 1 },
      { id: "two", pinnedAt: 2 },
    ];

    const encoded = encodePinnedEventContent(entries);
    expect(JSON.parse(encoded)).toEqual({ entries });
  });

  it("decodes structured payloads", () => {
    const content = JSON.stringify({
      entries: [
        { id: "first", pinnedAt: 5 },
        { id: "second", pinnedAt: "15" },
      ],
    });

    expect(decodePinnedEventContent(content)).toEqual<PinnedEntry[]>([
      { id: "first", pinnedAt: 5 },
      { id: "second", pinnedAt: 15 },
    ]);
  });

  it("falls back gracefully for invalid payloads", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(decodePinnedEventContent("not-json")).toEqual<PinnedEntry[]>([]);
    expect(decodePinnedEventContent(JSON.stringify({ foo: "bar" }))).toEqual<PinnedEntry[]>([]);
    warn.mockRestore();
  });
});
