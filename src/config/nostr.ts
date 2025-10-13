export interface BitcoinSquareRuntimeConfig {
  casualRoomKey?: string;
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

export const getConfiguredCasualRoomKey = (): string | null => {
  const envKey = normalizeKey(import.meta.env.VITE_CASUAL_ROOM_KEY);
  if (envKey) {
    return envKey;
  }

  const runtime = readRuntimeConfig();
  const runtimeKey = normalizeKey(runtime?.casualRoomKey);
  if (runtimeKey) {
    return runtimeKey;
  }

  return null;
};
