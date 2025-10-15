/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type CachedProfileEntry,
  readPersistedProfile,
  readSessionProfile,
  writePersistedProfile,
  writeSessionProfile,
} from "../utils/profileCache";
import safeJsonFetch, { JsonFetchError } from "../utils/safeJsonFetch";
import {
  generateScreenName,
  generateWarmAvatar,
  normalizeAvatarUrl,
  normalizeScreenName,
} from "../utils/profileDefaults";
import { SimplePool, type Event, decodeBech32 } from "../lib/nostrToolsShim";
import { useAuth, type User } from "./AuthContext";
import { deriveProfileReputation } from "../utils/reputation";

export interface BitcoinSquareProfile {
  pubkey: string;
  displayName: string;
  screenName?: string | null;
  avatarUrl: string;
  joined: string | null;
  totalPosts: number | null;
  reputationScore: number | null;
  rank: string | null;
  badges: string[];
  achievements?: string[];
  lightningAddress: string | null;
  followers?: string[];
  following?: string[];
}

export type ProfileStatus = "idle" | "loading" | "success" | "error" | "unavailable";

interface ProfileEntry {
  status: ProfileStatus;
  data: BitcoinSquareProfile | null;
  error: string | null;
  fetchedAt: number | null;
  stale: boolean;
}

export interface ProfileSummary {
  displayName: string;
  avatarUrl: string;
  profileUrl: string;
  lightningAddress: string | null;
}

interface ProfileIdentityContextValue {
  profiles: Record<string, ProfileEntry>;
  requestProfile: (pubkey: string, options?: { force?: boolean }) => Promise<BitcoinSquareProfile | null>;
  refreshProfile: (pubkey: string) => Promise<BitcoinSquareProfile | null>;
  resolveProfileSummary: (pubkey: string) => ProfileSummary;
  openProfile: (pubkey: string) => void;
  closeProfile: () => void;
  activeProfile: string | null;
  follow: (pubkey: string) => void;
  unfollow: (pubkey: string) => void;
  toggleFollow: (pubkey: string) => void;
  isFollowing: (pubkey: string) => boolean;
  following: ReadonlySet<string>;
  followersFor: (pubkey: string) => string[];
  startDirectMessage: (pubkey: string) => void;
  shortenPubkey: (pubkey: string) => string;
  fallbackAvatar: (pubkey: string) => string;
}

const ProfileIdentityContext = createContext<ProfileIdentityContextValue | null>(null);

const shorten = (value: string) => `${value.slice(0, 8)}…${value.slice(-8)}`;

const fallbackAvatar = (pubkey: string) => generateWarmAvatar(pubkey);

const profileUrl = (pubkey: string) => `https://bitcoinsquare.io/profile/${pubkey}`;

const HEX_PUBKEY_REGEX = /^[0-9a-f]{64}$/i;
const INVALID_PUBKEY_MESSAGE = "Invalid Nostr public key.";
export const PROFILE_UNAVAILABLE_MESSAGE = "Profile data is temporarily unavailable.";
export const PROFILE_STALE_MESSAGE = "Live profile lookup failed—showing cached details.";
const DEFAULT_PROFILE_RELAYS = ["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol"];
const PROFILE_RELAY_TIMEOUT_MS = 5000;
const API_RETRY_BACKOFF_MS = [0, 200, 800];
const FINAL_RETRY_DELAY_MS = 2000;

const profileRelayPool = new SimplePool();

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function retryWithBackoff<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      const delay = API_RETRY_BACKOFF_MS[Math.min(attempt, API_RETRY_BACKOFF_MS.length - 1)];
      if (delay > 0) {
        await wait(delay);
      }
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  if (FINAL_RETRY_DELAY_MS > 0) {
    await wait(FINAL_RETRY_DELAY_MS);
  }
  throw lastError ?? new Error("Profile lookup failed");
}

const hexFromBytes = (value: Uint8Array) =>
  Array.from(value)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const normalizedPubkeyCache = new Map<string, string>();

const normalizePubkeyInput = async (
  pubkey: string,
): Promise<{ pubkey: string } | { error: string }> => {
  if (typeof pubkey !== "string") {
    return { error: INVALID_PUBKEY_MESSAGE };
  }
  const trimmed = pubkey.trim();
  if (!trimmed) {
    return { error: INVALID_PUBKEY_MESSAGE };
  }

  const cached = normalizedPubkeyCache.get(trimmed);
  if (cached) {
    return { pubkey: cached };
  }

  if (HEX_PUBKEY_REGEX.test(trimmed)) {
    const normalized = trimmed.toLowerCase();
    normalizedPubkeyCache.set(trimmed, normalized);
    return { pubkey: normalized };
  }

  if (/^npub/i.test(trimmed)) {
    try {
      const decoded = await decodeBech32(trimmed);
      if (decoded.type === "npub") {
        if (typeof decoded.data === "string" && HEX_PUBKEY_REGEX.test(decoded.data)) {
          const normalized = decoded.data.toLowerCase();
          normalizedPubkeyCache.set(trimmed, normalized);
          return { pubkey: normalized };
        }
        if (decoded.data instanceof Uint8Array) {
          const normalized = hexFromBytes(decoded.data).toLowerCase();
          if (HEX_PUBKEY_REGEX.test(normalized)) {
            normalizedPubkeyCache.set(trimmed, normalized);
            return { pubkey: normalized };
          }
        }
      }
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.warn("Failed to decode bech32 pubkey", error);
      }
    }
  }

  return { error: INVALID_PUBKEY_MESSAGE };
};

const parseRelayList = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.startsWith("wss://"));
  }
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0 && entry.startsWith("wss://"));
  }
  return [];
};

const resolveReadingRelays = (user: User | null | undefined): string[] => {
  const envRelays = [
    env.VITE_PROFILE_RELAYS,
    env.VITE_NOSTR_READ_RELAYS,
    env.VITE_NOSTR_RELAYS,
  ].flatMap(parseRelayList);

  const preferenceRelays = user?.preferences
    ? [
        parseRelayList((user.preferences as Record<string, unknown>).nostrReadingRelays),
        parseRelayList((user.preferences as Record<string, unknown>).readingRelays),
      ].flat()
    : [];

  const accountRelays = parseRelayList((user as unknown as { nostrRelays?: unknown })?.nostrRelays);

  const combined = [...preferenceRelays, ...accountRelays, ...envRelays, ...DEFAULT_PROFILE_RELAYS];

  return combined
    .map((relay) => relay.trim())
    .filter((relay, index, array) => relay.length > 0 && array.indexOf(relay) === index);
};

const env = (() => {
  const nodeProcess =
    typeof globalThis !== "undefined" && (globalThis as { process?: { env?: Record<string, string | undefined> } })?.process;
  if (nodeProcess?.env) {
    return nodeProcess.env;
  }
  if (typeof import.meta !== "undefined" && (import.meta as any)?.env) {
    return (import.meta as any).env as Record<string, string | undefined>;
  }
  return {} as Record<string, string | undefined>;
})();

const resolveProfileApiBase = () => {
  const candidates = [
    env.VITE_PROFILE_API_BASE_URL,
    env.VITE_PROFILE_SERVICE_URL,
    env.NEXT_PUBLIC_PROFILE_API_BASE_URL,
    env.NEXT_PUBLIC_PROFILE_SERVICE_URL,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const trimmed = candidate.trim();
      return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
    }
  }

  return "https://bitcoinsquare.io/api";
};

const PROFILE_API_BASE = resolveProfileApiBase();

const trimTrailingSlash = (value: string) => (value.endsWith("/") ? value.slice(0, -1) : value);

const resolveProfileApiTemplates = () => {
  const overrides = [
    env.VITE_PROFILE_API_URL,
    env.NEXT_PUBLIC_PROFILE_API_URL,
    env.VITE_PROFILE_API_ENDPOINT,
    env.NEXT_PUBLIC_PROFILE_API_ENDPOINT,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const normalizedOverrides = overrides.map((value) => value.trim());
  if (normalizedOverrides.length > 0) {
    return Array.from(
      new Set(
        normalizedOverrides.flatMap((value) =>
          value.includes("{pubkey}")
            ? [value]
            : [
                `${trimTrailingSlash(value)}/users/{pubkey}.json`,
                `${trimTrailingSlash(value)}/users/{pubkey}`,
              ],
        ),
      ),
    );
  }

  const base = trimTrailingSlash(PROFILE_API_BASE);
  return [`${base}/users/{pubkey}.json`, `${base}/users/{pubkey}`];
};

const PROFILE_API_TEMPLATES = resolveProfileApiTemplates();

const buildProfileApiCandidates = (pubkey: string) =>
  PROFILE_API_TEMPLATES.map((template) => template.replace("{pubkey}", encodeURIComponent(pubkey)));

const FOLLOWING_STORAGE_KEY = "bitcoin-square-following";
const CACHE_TTL = 1000 * 60 * 15; // 15 minutes

const isJsonFetchError = (error: unknown): error is JsonFetchError => error instanceof JsonFetchError;

const handleJsonFetchError = (pubkey: string, error: JsonFetchError): JsonFetchError => {
  if (import.meta.env?.DEV) {
    console.warn("Profile fetch failed", {
      pubkey,
      status: error.status,
      reason: error.reason,
      contentType: error.contentType,
      snippet: error.bodySnippet,
    });
  }
  return error;
};

class ProfileFetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ProfileFetchError";
    if (options?.cause && "cause" in Error.prototype) {
      try {
        // @ts-expect-error cause assignment is supported in modern runtimes
        this.cause = options.cause;
      } catch {
        /* noop */
      }
    }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const extractProfilePayload = (
  pubkey: string,
  payload: unknown,
): Partial<BitcoinSquareProfile> => {
  if (!isRecord(payload)) {
    throw new ProfileFetchError(PROFILE_FALLBACK_MESSAGE, { cause: payload });
  }

  if ("error" in payload) {
    const detail = payload.error;
    const message =
      typeof detail === "string"
        ? detail
        : isRecord(detail) && typeof detail.message === "string"
          ? detail.message
          : PROFILE_FALLBACK_MESSAGE;
    throw new ProfileFetchError(message, { cause: detail });
  }

  const nested =
    "profile" in payload && isRecord(payload.profile)
      ? (payload.profile as Record<string, unknown>)
      : payload;

  if (!isRecord(nested)) {
    throw new ProfileFetchError(PROFILE_FALLBACK_MESSAGE, { cause: nested });
  }

  const normalized: Partial<BitcoinSquareProfile> = { ...nested };

  if (typeof normalized.pubkey !== "string" || normalized.pubkey.trim().length === 0) {
    normalized.pubkey = pubkey;
  }

  return normalized;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const normalizeProfile = (pubkey: string, payload: Partial<BitcoinSquareProfile>): BitcoinSquareProfile => {
  const rawPayload = payload as Record<string, unknown>;
  const badges = Array.isArray(payload.badges)
    ? payload.badges
    : Array.isArray(payload.achievements)
      ? payload.achievements
      : [];
  const seed = pubkey || "profile";
  const displayName = normalizeScreenName(payload.screenName ?? payload.displayName, seed);
  const reputationSnapshot = deriveProfileReputation(rawPayload);
  const computedReputation = Number.isFinite(reputationSnapshot.score)
    ? (reputationSnapshot.score as number)
    : undefined;
  const computedRank = reputationSnapshot.rankLabel ?? undefined;
  return {
    pubkey,
    displayName,
    screenName: payload.screenName ?? displayName,
    avatarUrl: normalizeAvatarUrl(payload.avatarUrl, seed),
    joined: payload.joined ?? null,
    totalPosts:
      typeof payload.totalPosts === "number" && Number.isFinite(payload.totalPosts)
        ? payload.totalPosts
        : null,
    reputationScore:
      computedReputation ??
      (typeof payload.reputationScore === "number" && Number.isFinite(payload.reputationScore)
        ? payload.reputationScore
        : null),
    rank: computedRank ?? (typeof payload.rank === "string" && payload.rank.trim().length > 0 ? payload.rank : null),
    badges,
    achievements: payload.achievements,
    lightningAddress:
      typeof payload.lightningAddress === "string" && payload.lightningAddress.trim().length > 0
        ? payload.lightningAddress.trim()
        : null,
    followers: Array.isArray(payload.followers)
      ? payload.followers.filter(isNonEmptyString)
      : [],
    following: Array.isArray(payload.following)
      ? payload.following.filter(isNonEmptyString)
      : [],
  };
};

interface FollowStoragePayload {
  following?: unknown;
  followers?: unknown;
}

const loadFollowState = () => {
  if (typeof window === "undefined") {
    return { following: [] as string[], followers: {} as Record<string, string[]> };
  }
  try {
    const raw = window.localStorage.getItem(FOLLOWING_STORAGE_KEY);
    if (!raw) {
      return { following: [] as string[], followers: {} as Record<string, string[]> };
    }
    const parsed = JSON.parse(raw) as FollowStoragePayload | string[];
    if (Array.isArray(parsed)) {
      const following = parsed.filter(isNonEmptyString);
      return { following, followers: {} };
    }
    if (!isRecord(parsed)) {
      return { following: [] as string[], followers: {} as Record<string, string[]> };
    }
    const followingSource = Array.isArray(parsed.following)
      ? parsed.following.filter(isNonEmptyString)
      : [];
    const followersPayload = isRecord(parsed.followers) ? (parsed.followers as Record<string, unknown>) : {};
    const followers: Record<string, string[]> = {};
    Object.entries(followersPayload).forEach(([key, value]) => {
      if (!isNonEmptyString(key) || !Array.isArray(value)) {
        return;
      }
      const normalized = value.filter(isNonEmptyString);
      if (normalized.length > 0) {
        followers[key] = normalized;
      }
    });
    return { following: followingSource, followers };
  } catch (error) {
    console.warn("Failed to parse following list", error);
    return { following: [] as string[], followers: {} as Record<string, string[]> };
  }
};

const toSortedArray = (values: Iterable<string>) =>
  Array.from(values)
    .filter(isNonEmptyString)
    .map((value) => value.trim())
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b));

const persistFollowState = (following: Set<string>, followers: Map<string, Set<string>>) => {
  if (typeof window === "undefined") return;
  try {
    const followerRecord: Record<string, string[]> = {};
    followers.forEach((set, key) => {
      if (!isNonEmptyString(key) || set.size === 0) {
        return;
      }
      const sorted = toSortedArray(set);
      if (sorted.length > 0) {
        followerRecord[key] = sorted;
      }
    });
    window.localStorage.setItem(
      FOLLOWING_STORAGE_KEY,
      JSON.stringify({
        following: toSortedArray(following),
        followers: followerRecord,
      }),
    );
  } catch (error) {
    console.warn("Unable to persist following list", error);
  }
};

export const PROFILE_FALLBACK_MESSAGE = "Profile unavailable. Try again later.";

const extractStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
    : [];

const buildRelayProfilePayload = (event: Event): Partial<BitcoinSquareProfile> => {
  let content: Record<string, unknown> | null = null;
  if (typeof event.content === "string" && event.content.trim().length > 0) {
    try {
      content = JSON.parse(event.content) as Record<string, unknown>;
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.warn("Failed to parse relay profile payload", error);
      }
    }
  }

  const safe = (key: string): string | null => {
    if (!content) return null;
    const value = content[key];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const created = Number.isFinite(event.created_at)
    ? new Date(event.created_at * 1000).toISOString()
    : null;

  const lightning = safe("lud16") ?? safe("lud06") ?? safe("lightning") ?? safe("lnurl");

  return {
    pubkey: event.pubkey,
    screenName: safe("name") ?? undefined,
    displayName: safe("display_name") ?? undefined,
    avatarUrl: safe("picture") ?? undefined,
    joined: created,
    lightningAddress: lightning,
    badges: content ? extractStringArray(content.badges) : [],
    achievements: content ? extractStringArray(content.achievements) : [],
    followers: content ? extractStringArray(content.followers) : [],
    following: content ? extractStringArray(content.following) : [],
  };
};

const fetchProfileFromRelays = async (
  pubkey: string,
  relays: string[],
): Promise<BitcoinSquareProfile> => {
  const uniqueRelays = relays
    .map((relay) => relay.trim())
    .filter((relay, index, array) => relay.startsWith("wss://") && array.indexOf(relay) === index);

  if (uniqueRelays.length === 0) {
    throw new ProfileFetchError("No relays configured for profile lookup");
  }

  await profileRelayPool.waitUntilReady();

  return new Promise<BitcoinSquareProfile>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (settled) return;
      settled = true;
      subscription?.close();
      profileRelayPool.close(uniqueRelays);
      reject(new ProfileFetchError(PROFILE_FALLBACK_MESSAGE));
    }, PROFILE_RELAY_TIMEOUT_MS);
    const pending = new Set(uniqueRelays);
    const relayErrors = new Map<string, unknown>();

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      subscription?.close();
      profileRelayPool.close(uniqueRelays);
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error instanceof ProfileFetchError) {
        reject(error);
        return;
      }
      reject(new ProfileFetchError(PROFILE_FALLBACK_MESSAGE, { cause: error }));
    };

    const filters = [{ kinds: [0], authors: [pubkey], limit: 1 }];
    let subscription: ReturnType<SimplePool["subscribeMany"]> | null = null;

    subscription = profileRelayPool.subscribeMany(uniqueRelays, filters, {
      onevent: (event: Event) => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          const payload = buildRelayProfilePayload(event);
          resolve(normalizeProfile(pubkey, payload));
        } catch (error) {
          fail(error);
        }
      },
      oneose: (relay?: string) => {
        if (relay) {
          pending.delete(relay);
        }
        if (!settled && pending.size === 0) {
          fail(relayErrors.size > 0 ? Array.from(relayErrors.values()).at(-1) : null);
        }
      },
      onerror: (error, relay) => {
        if (relay) {
          pending.delete(relay);
          relayErrors.set(relay, error);
        }
        if (!settled && pending.size === 0) {
          fail(error);
        }
      },
    });
  });
};

const fetchProfileFromApi = async (pubkey: string): Promise<BitcoinSquareProfile> => {
  const urls = buildProfileApiCandidates(pubkey);
  const errors: unknown[] = [];
  for (const url of urls) {
    try {
      const response = await safeJsonFetch<unknown>(url);
      const payload = extractProfilePayload(pubkey, response);
      return normalizeProfile(pubkey, payload);
    } catch (error) {
      errors.push(error);
    }
  }

  const finalError = errors.at(-1);
  if (finalError) {
    if (isJsonFetchError(finalError)) {
      const normalized = handleJsonFetchError(pubkey, finalError);
      throw new ProfileFetchError(PROFILE_FALLBACK_MESSAGE, { cause: normalized });
    }
    if (finalError instanceof ProfileFetchError) {
      throw finalError;
    }
    throw new ProfileFetchError(PROFILE_FALLBACK_MESSAGE, { cause: finalError });
  }

  throw new ProfileFetchError(PROFILE_FALLBACK_MESSAGE);
};

interface ProfileFetchOutcome {
  profile: BitcoinSquareProfile | null;
  stale: boolean;
  message: string | null;
  source: "api" | "relay" | "cache" | "none";
  errors: unknown[];
}

const fetchProfileWithFallbacks = async (
  canonicalPubkey: string,
  relays: string[],
  lastKnown: CachedProfileEntry<BitcoinSquareProfile> | null,
): Promise<ProfileFetchOutcome> => {
  const errors: unknown[] = [];

  try {
    const profile = await retryWithBackoff(() => fetchProfileFromApi(canonicalPubkey));
    return { profile, stale: false, message: null, source: "api", errors };
  } catch (error) {
    errors.push(error);
  }

  try {
    const profile = await retryWithBackoff(() => fetchProfileFromRelays(canonicalPubkey, relays));
    return { profile, stale: false, message: null, source: "relay", errors };
  } catch (error) {
    errors.push(error);
  }

  if (lastKnown) {
    return {
      profile: lastKnown.profile,
      stale: true,
      message: PROFILE_STALE_MESSAGE,
      source: "cache",
      errors,
    };
  }

  const finalError = errors.find((candidate) => candidate instanceof ProfileFetchError) as
    | ProfileFetchError
    | undefined;
  const message = finalError?.message ?? PROFILE_UNAVAILABLE_MESSAGE;

  return { profile: null, stale: false, message, source: "none", errors };
};

export const formatMemberSince = (value?: string | null) => {
  if (!value) return "—";
  const trimmed = value.trim();
  if (!trimmed) return "—";
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch (error) {
    console.warn("Failed to format member since", error);
    return date.toLocaleDateString();
  }
};

export const ProfileIdentityProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { user } = useAuth();
  const viewerPubkey = user?.nostrPublicKey?.trim() || null;
  const readingRelays = useMemo(() => resolveReadingRelays(user), [user]);
  const [profiles, setProfiles] = useState<Record<string, ProfileEntry>>({});
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const profilesRef = useRef(profiles);
  const inflight = useRef(new Map<string, Promise<BitcoinSquareProfile | null>>() );
  const readingRelaysRef = useRef(readingRelays);
  const initialFollowStateRef = useRef(loadFollowState());
  const [following, setFollowing] = useState<Set<string>>(
    () => new Set(initialFollowStateRef.current.following.map((value) => value.trim()).filter(isNonEmptyString)),
  );
  const [followersMap, setFollowersMap] = useState<Map<string, Set<string>>>(() => {
    const map = new Map<string, Set<string>>();
    Object.entries(initialFollowStateRef.current.followers).forEach(([key, list]) => {
      if (!isNonEmptyString(key)) return;
      const normalized = list.filter(isNonEmptyString);
      if (normalized.length > 0) {
        map.set(key, new Set(normalized));
      }
    });
    return map;
  });

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    readingRelaysRef.current = readingRelays;
  }, [readingRelays]);

  useEffect(() => {
    persistFollowState(following, followersMap);
  }, [following, followersMap]);

  const mutateProfileData = useCallback(
    (pubkey: string, updater: (profile: BitcoinSquareProfile) => BitcoinSquareProfile | null) => {
      setProfiles((prev) => {
        const entry = prev[pubkey];
        if (!entry?.data) {
          return prev;
        }
        const updatedProfile = updater(entry.data);
        if (!updatedProfile) {
          return prev;
        }
        if (updatedProfile === entry.data) {
          return prev;
        }
        return {
          ...prev,
          [pubkey]: {
            ...entry,
            data: updatedProfile,
          },
        };
      });
    },
    [],
  );

  const syncViewerFollowing = useCallback(
    (nextFollowing: Set<string>) => {
      if (!viewerPubkey) return;
      mutateProfileData(viewerPubkey, (profile) => {
        const nextList = toSortedArray(nextFollowing);
        const currentList = Array.isArray(profile.following) ? toSortedArray(profile.following) : [];
        const sameLength = nextList.length === currentList.length;
        if (sameLength && nextList.every((value, index) => value === currentList[index])) {
          return profile;
        }
        return {
          ...profile,
          following: nextList,
        };
      });
    },
    [mutateProfileData, viewerPubkey],
  );

  const syncTargetFollowers = useCallback(
    (targetPubkey: string, followers: Set<string>) => {
      mutateProfileData(targetPubkey, (profile) => {
        const nextFollowers = toSortedArray(followers);
        const currentFollowers = Array.isArray(profile.followers) ? toSortedArray(profile.followers) : [];
        const sameLength = nextFollowers.length === currentFollowers.length;
        if (sameLength && nextFollowers.every((value, index) => value === currentFollowers[index])) {
          return profile;
        }
        return {
          ...profile,
          followers: nextFollowers,
        };
      });
    },
    [mutateProfileData],
  );

  const updateProfileEntry = useCallback((pubkey: string, updater: (entry: ProfileEntry | undefined) => ProfileEntry) => {
    setProfiles((prev) => {
      const next = { ...prev, [pubkey]: updater(prev[pubkey]) };
      return next;
    });
  }, []);

  const requestProfile = useCallback(
    async (pubkey: string, options?: { force?: boolean }) => {
      if (!pubkey) return null;
      const trimmed = pubkey.trim();
      if (!trimmed) return null;
      const force = options?.force ?? false;
      const now = Date.now();
      const current = profilesRef.current[trimmed];

      let lastKnown: CachedProfileEntry<BitcoinSquareProfile> | null = null;
      if (current?.data) {
        lastKnown = {
          profile: current.data,
          fetchedAt: current.fetchedAt ?? now,
        };
        if (!force && current.status === "success" && current.fetchedAt && now - current.fetchedAt < CACHE_TTL) {
          return current.data;
        }
      }

      if (!force) {
        const sessionEntry = readSessionProfile<BitcoinSquareProfile>(trimmed);
        if (sessionEntry) {
          if (!lastKnown || sessionEntry.fetchedAt > lastKnown.fetchedAt) {
            lastKnown = sessionEntry;
          }
          if (now - sessionEntry.fetchedAt < CACHE_TTL) {
            updateProfileEntry(trimmed, () => ({
              status: "success",
              data: sessionEntry.profile,
              error: null,
              fetchedAt: sessionEntry.fetchedAt,
              stale: false,
            }));
            return sessionEntry.profile;
          }
        }
      }

      if (!force) {
        const persisted = await readPersistedProfile<BitcoinSquareProfile>(trimmed);
        if (persisted) {
          if (!lastKnown || persisted.fetchedAt > lastKnown.fetchedAt) {
            lastKnown = persisted;
          }
          if (now - persisted.fetchedAt < CACHE_TTL) {
            updateProfileEntry(trimmed, () => ({
              status: "success",
              data: persisted.profile,
              error: null,
              fetchedAt: persisted.fetchedAt,
              stale: false,
            }));
            writeSessionProfile(trimmed, persisted);
            return persisted.profile;
          }
        }
      }

      const existingPromise = inflight.current.get(trimmed);
      if (existingPromise && !force) {
        return existingPromise;
      }

      const promise = (async () => {
        const normalized = await normalizePubkeyInput(trimmed);
        if ("error" in normalized) {
          const fallbackProfile = lastKnown?.profile ?? null;
          updateProfileEntry(trimmed, (entry) => ({
            status: "unavailable",
            data: entry?.data ?? fallbackProfile,
            error: normalized.error,
            fetchedAt: entry?.fetchedAt ?? lastKnown?.fetchedAt ?? null,
            stale: Boolean(entry?.data ?? fallbackProfile),
          }));
          return fallbackProfile;
        }

        const canonicalPubkey = normalized.pubkey;

        updateProfileEntry(trimmed, (entry) => ({
          status: "loading",
          data: entry?.data ?? lastKnown?.profile ?? null,
          error: null,
          fetchedAt: entry?.fetchedAt ?? lastKnown?.fetchedAt ?? null,
          stale: entry?.stale ?? Boolean(lastKnown),
        }));

        try {
          const result = await fetchProfileWithFallbacks(canonicalPubkey, readingRelaysRef.current, lastKnown);

          if (result.profile) {
            const fetchedAt = result.stale ? lastKnown?.fetchedAt ?? Date.now() : Date.now();

            if (!result.stale) {
              const record: CachedProfileEntry<BitcoinSquareProfile> = {
                profile: result.profile,
                fetchedAt,
              };
              writeSessionProfile(trimmed, record);
              await writePersistedProfile(trimmed, record);
              if (canonicalPubkey !== trimmed) {
                writeSessionProfile(canonicalPubkey, record);
                await writePersistedProfile(canonicalPubkey, record);
              }
            }

            updateProfileEntry(trimmed, () => ({
              status: result.stale ? "unavailable" : "success",
              data: result.profile,
              error: result.stale ? result.message : null,
              fetchedAt,
              stale: result.stale,
            }));

            return result.profile;
          }

          if (import.meta.env?.DEV) {
            console.warn("Profile fetch failed", {
              pubkey: trimmed,
              canonical: canonicalPubkey,
              relays: readingRelaysRef.current,
              errors: result.errors,
            });
          }

          const fallbackProfile = lastKnown?.profile ?? null;
          updateProfileEntry(trimmed, (entry) => ({
            status: "unavailable",
            data: entry?.data ?? fallbackProfile,
            error: result.message ?? PROFILE_UNAVAILABLE_MESSAGE,
            fetchedAt: entry?.fetchedAt ?? lastKnown?.fetchedAt ?? null,
            stale: Boolean(entry?.data ?? fallbackProfile),
          }));
          return fallbackProfile;
        } catch (error) {
          const fallbackProfile = lastKnown?.profile ?? null;
          if (import.meta.env?.DEV) {
            console.warn("Profile fetch encountered an unexpected error", {
              pubkey: trimmed,
              error,
            });
          }
          const message =
            error instanceof Error && error.message ? error.message : PROFILE_UNAVAILABLE_MESSAGE;
          updateProfileEntry(trimmed, (entry) => ({
            status: "unavailable",
            data: entry?.data ?? fallbackProfile,
            error: message,
            fetchedAt: entry?.fetchedAt ?? lastKnown?.fetchedAt ?? null,
            stale: Boolean(entry?.data ?? fallbackProfile),
          }));
          return fallbackProfile;
        }
      })().finally(() => {
        inflight.current.delete(trimmed);
      });

      inflight.current.set(trimmed, promise);
      return promise;
    },
    [readingRelaysRef, updateProfileEntry],
  );

  const refreshProfile = useCallback(
    (pubkey: string) => requestProfile(pubkey, { force: true }),
    [requestProfile],
  );

  const resolveProfileSummary = useCallback(
    (pubkey: string): ProfileSummary => {
      const entry = profilesRef.current[pubkey];
      const data = entry?.data;
      const fallbackName = generateScreenName(pubkey);
      return {
        displayName: data?.displayName ?? data?.screenName ?? fallbackName,
        avatarUrl: data?.avatarUrl ?? fallbackAvatar(pubkey),
        profileUrl: profileUrl(pubkey),
        lightningAddress: data?.lightningAddress ?? null,
      };
    },
    [],
  );

  const follow = useCallback((pubkey: string) => {
    if (!isNonEmptyString(pubkey)) {
      return;
    }
    const normalized = pubkey.trim();
    if (viewerPubkey && normalized === viewerPubkey) {
      return;
    }
    setFollowing((prev) => {
      if (prev.has(normalized)) return prev;
      const next = new Set(prev);
      next.add(normalized);
      syncViewerFollowing(next);
      return next;
    });
    if (viewerPubkey) {
      setFollowersMap((prev) => {
        const existing = prev.get(normalized);
        if (existing?.has(viewerPubkey)) {
          return prev;
        }
        const next = new Map(prev);
        const followerSet = new Set(existing ?? []);
        followerSet.add(viewerPubkey);
        next.set(normalized, followerSet);
        syncTargetFollowers(normalized, followerSet);
        return next;
      });
    }
  }, [syncTargetFollowers, syncViewerFollowing, viewerPubkey]);

  const unfollow = useCallback((pubkey: string) => {
    if (!isNonEmptyString(pubkey)) {
      return;
    }
    const normalized = pubkey.trim();
    setFollowing((prev) => {
      if (!prev.has(normalized)) return prev;
      const next = new Set(prev);
      next.delete(normalized);
      syncViewerFollowing(next);
      return next;
    });
    if (viewerPubkey) {
      setFollowersMap((prev) => {
        const existing = prev.get(normalized);
        if (!existing?.has(viewerPubkey)) {
          return prev;
        }
        const next = new Map(prev);
        const followerSet = new Set(existing);
        followerSet.delete(viewerPubkey);
        if (followerSet.size === 0) {
          next.delete(normalized);
        } else {
          next.set(normalized, followerSet);
        }
        syncTargetFollowers(normalized, followerSet);
        return next;
      });
    }
  }, [syncTargetFollowers, syncViewerFollowing, viewerPubkey]);

  const toggleFollow = useCallback(
    (pubkey: string) => {
      if (!isNonEmptyString(pubkey)) {
        return;
      }
      if (following.has(pubkey)) {
        unfollow(pubkey);
      } else {
        follow(pubkey);
      }
    },
    [follow, following, unfollow],
  );

  const isFollowing = useCallback((pubkey: string) => following.has(pubkey), [following]);

  const followersFor = useCallback(
    (pubkey: string) => {
      const entry = followersMap.get(pubkey);
      if (!entry) return [];
      return toSortedArray(entry);
    },
    [followersMap],
  );

  const startDirectMessage = useCallback((pubkey: string) => {
    if (typeof window === "undefined") return;
    const detail = { pubkey };
    window.dispatchEvent(new CustomEvent("bitcoinsquare:open-dm", { detail }));
  }, []);

  const openProfile = useCallback((pubkey: string) => {
    setActiveProfile(pubkey);
  }, []);

  const closeProfile = useCallback(() => {
    setActiveProfile(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ pubkey?: string | null }>).detail;
      const pubkeyValue = detail?.pubkey;
      if (typeof pubkeyValue === "string" && pubkeyValue.trim().length > 0) {
        openProfile(pubkeyValue);
      }
    };

    const handleClose = () => {
      closeProfile();
    };

    window.addEventListener("bitcoinsquare:open-profile", handleOpen as EventListener);
    window.addEventListener("bitcoinsquare:close-profile", handleClose);

    return () => {
      window.removeEventListener("bitcoinsquare:open-profile", handleOpen as EventListener);
      window.removeEventListener("bitcoinsquare:close-profile", handleClose);
    };
  }, [closeProfile, openProfile]);

  const contextValue = useMemo<ProfileIdentityContextValue>(
    () => ({
      profiles,
      requestProfile,
      refreshProfile,
      resolveProfileSummary,
      openProfile,
      closeProfile,
      activeProfile,
      follow,
      unfollow,
      toggleFollow,
      isFollowing,
      following,
      followersFor,
      startDirectMessage,
      shortenPubkey: shorten,
      fallbackAvatar,
    }),
    [
      profiles,
      requestProfile,
      refreshProfile,
      resolveProfileSummary,
      openProfile,
      closeProfile,
      activeProfile,
      follow,
      unfollow,
      toggleFollow,
      isFollowing,
      following,
      followersFor,
      startDirectMessage,
    ],
  );

  return (
    <ProfileIdentityContext.Provider value={contextValue}>{children}</ProfileIdentityContext.Provider>
  );
};

export const useProfileIdentity = () => {
  const context = useContext(ProfileIdentityContext);
  if (!context) {
    throw new Error("useProfileIdentity must be used within a ProfileIdentityProvider");
  }
  return context;
};

export const useUserProfile = (pubkey: string | null | undefined) => {
  const {
    profiles,
    requestProfile,
    refreshProfile,
    isFollowing,
  } = useProfileIdentity();

  useEffect(() => {
    if (!pubkey) return;
    requestProfile(pubkey).catch(() => undefined);
  }, [pubkey, requestProfile]);

  const entry = pubkey ? profiles[pubkey] : undefined;

  const status: ProfileStatus = pubkey
    ? entry?.status ?? "loading"
    : "idle";

  return {
    status,
    profile: entry?.data ?? null,
    error: entry?.error ?? null,
    stale: entry?.stale ?? false,
    refresh: () => (pubkey ? refreshProfile(pubkey) : Promise.resolve(null)),
    isFollowing: pubkey ? isFollowing(pubkey) : false,
  };
};

export const shortenPubkey = shorten;
export const fallbackProfileAvatar = fallbackAvatar;
