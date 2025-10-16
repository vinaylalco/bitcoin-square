export interface BitcoinSquareRuntimeConfig {
  casualRoomKey?: string;
  roomKeys?: Record<string, string | undefined>;
}

const readRuntimeConfig = (): BitcoinSquareRuntimeConfig | null => {
  if (typeof globalThis === "undefined") return null;
  const anyGlobal = globalThis as typeof globalThis & {
    __BITCOINSQUARE_CONFIG__?: BitcoinSquareRuntimeConfig | null;
  };
  const runtime = anyGlobal.__BITCOINSQUARE_CONFIG__;
  if (!runtime || typeof runtime !== "object") {
    return null;
  }
  return runtime;
};

const normalizeKey = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const formatRoomEnvKey = (roomId: string) =>
  `VITE_ROOM_KEY_${roomId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;

export const getConfiguredRoomKey = (roomId: string): string | null => {
  const normalizedRoomId = roomId.trim();
  if (!normalizedRoomId) {
    return null;
  }

  const env = import.meta.env as Record<string, string | undefined>;
  const specificEnvKey = normalizeKey(env[formatRoomEnvKey(normalizedRoomId)]);
  if (specificEnvKey) {
    return specificEnvKey;
  }

  if (normalizedRoomId === "bitcoinsquare-casual") {
    const legacyEnvKey = normalizeKey(import.meta.env.VITE_CASUAL_ROOM_KEY);
    if (legacyEnvKey) {
      return legacyEnvKey;
    }
  }

  const runtime = readRuntimeConfig();
  const runtimeSpecificKey = normalizeKey(runtime?.roomKeys?.[normalizedRoomId]);
  if (runtimeSpecificKey) {
    return runtimeSpecificKey;
  }

  if (normalizedRoomId === "bitcoinsquare-casual") {
    const legacyRuntimeKey = normalizeKey(runtime?.casualRoomKey);
    if (legacyRuntimeKey) {
      return legacyRuntimeKey;
    }
  }

  const fallbackEnvKey = normalizeKey(import.meta.env.VITE_CASUAL_ROOM_KEY);
  if (fallbackEnvKey) {
    return fallbackEnvKey;
  }

  const fallbackRuntimeKey = normalizeKey(runtime?.casualRoomKey);
  if (fallbackRuntimeKey) {
    return fallbackRuntimeKey;
  }

  return null;
};

export const getConfiguredCasualRoomKey = (): string | null =>
  getConfiguredRoomKey("bitcoinsquare-casual");
