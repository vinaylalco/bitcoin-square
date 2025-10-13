import { createStore, get, set } from "./keyValueStore";

export interface CachedProfileEntry<TProfile = unknown> {
  profile: TProfile;
  fetchedAt: number;
}

const SESSION_PREFIX = "bitcoin-square-profile:";
const profileStore = createStore("bitcoin-square-profiles", "profiles");

const readPersisted = async <TProfile>(key: string): Promise<CachedProfileEntry<TProfile> | null> => {
  try {
    const result = await get<CachedProfileEntry<TProfile>>(key, profileStore);
    return result ?? null;
  } catch (error) {
    console.warn("Failed to read profile cache", error);
    return null;
  }
};

const writePersisted = async <TProfile>(key: string, entry: CachedProfileEntry<TProfile>) => {
  try {
    await set(key, entry, profileStore);
  } catch (error) {
    console.warn("Failed to persist profile cache", error);
  }
};

const makeKey = (pubkey: string) => `profile:${pubkey}`;

export const readPersistedProfile = async <TProfile extends { pubkey: string }>(
  pubkey: string,
): Promise<CachedProfileEntry<TProfile> | null> => readPersisted<TProfile>(makeKey(pubkey));

export const writePersistedProfile = async <TProfile extends { pubkey: string }>(
  pubkey: string,
  entry: CachedProfileEntry<TProfile>,
) => writePersisted(makeKey(pubkey), entry);

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
