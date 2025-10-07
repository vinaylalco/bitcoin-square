export interface CachedProfileEntry<TProfile = unknown> {
  profile: TProfile;
  fetchedAt: number;
}

type KeyValModule = typeof import("idb-keyval");

const SESSION_PREFIX = "bitcoin-square-profile:";

let keyValPromise: Promise<KeyValModule> | null = null;
let profileStore: Awaited<ReturnType<KeyValModule["createStore"]>> | null = null;

const loadKeyVal = async (): Promise<KeyValModule> => {
  if (!keyValPromise) {
    keyValPromise = import(
      /* @vite-ignore */ "https://esm.sh/idb-keyval@6.3.1?bundle"
    ) as Promise<KeyValModule>;
  }
  return keyValPromise;
};

const getProfileStore = async () => {
  if (profileStore) return profileStore;
  const { createStore } = await loadKeyVal();
  profileStore = createStore("bitcoin-square-profiles", "profiles");
  return profileStore;
};

const makeKey = (pubkey: string) => `profile:${pubkey}`;

export const readPersistedProfile = async <TProfile extends { pubkey: string }>(
  pubkey: string,
): Promise<CachedProfileEntry<TProfile> | null> => {
  try {
    const { get } = await loadKeyVal();
    const store = await getProfileStore();
    const result = await get<CachedProfileEntry<TProfile>>(makeKey(pubkey), store);
    return result ?? null;
  } catch (error) {
    console.warn("Failed to read profile cache", error);
    return null;
  }
};

export const writePersistedProfile = async <TProfile extends { pubkey: string }>(
  pubkey: string,
  entry: CachedProfileEntry<TProfile>,
) => {
  try {
    const { set } = await loadKeyVal();
    const store = await getProfileStore();
    await set(makeKey(pubkey), entry, store);
  } catch (error) {
    console.warn("Failed to persist profile cache", error);
  }
};

export const readSessionProfile = <TProfile extends { pubkey: string }>(
  pubkey: string,
): CachedProfileEntry<TProfile> | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${SESSION_PREFIX}${pubkey}`);
    if (!raw) return null;
    return JSON.parse(raw) as CachedProfileEntry<TProfile>;
  } catch (error) {
    console.warn("Failed to read session profile cache", error);
    return null;
  }
};

export const writeSessionProfile = <TProfile extends { pubkey: string }>(
  pubkey: string,
  entry: CachedProfileEntry<TProfile>,
) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${SESSION_PREFIX}${pubkey}`, JSON.stringify(entry));
  } catch (error) {
    console.warn("Failed to store session profile cache", error);
  }
};
