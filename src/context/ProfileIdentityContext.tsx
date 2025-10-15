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
import { useAuth } from "./AuthContext";
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

export type ProfileStatus = "idle" | "loading" | "success" | "error";

interface ProfileEntry {
  status: ProfileStatus;
  data: BitcoinSquareProfile | null;
  error: string | null;
  fetchedAt: number | null;
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
  const [profiles, setProfiles] = useState<Record<string, ProfileEntry>>({});
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const profilesRef = useRef(profiles);
  const inflight = useRef(new Map<string, Promise<BitcoinSquareProfile | null>>() );
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
      const force = options?.force ?? false;
      const current = profilesRef.current[pubkey];
      const now = Date.now();
      if (
        !force &&
        current &&
        current.status === "success" &&
        current.fetchedAt &&
        now - current.fetchedAt < CACHE_TTL
      ) {
        return current.data;
      }

      if (!force) {
        const sessionEntry = readSessionProfile<BitcoinSquareProfile>(pubkey);
        if (sessionEntry && now - sessionEntry.fetchedAt < CACHE_TTL) {
          updateProfileEntry(pubkey, () => ({
            status: "success",
            data: sessionEntry.profile,
            error: null,
            fetchedAt: sessionEntry.fetchedAt,
          }));
          return sessionEntry.profile;
        }
      }

      if (!force) {
        const persisted = await readPersistedProfile<BitcoinSquareProfile>(pubkey);
        if (persisted && now - persisted.fetchedAt < CACHE_TTL) {
          updateProfileEntry(pubkey, () => ({
            status: "success",
            data: persisted.profile,
            error: null,
            fetchedAt: persisted.fetchedAt,
          }));
          writeSessionProfile(pubkey, persisted);
          return persisted.profile;
        }
      }

      const existingPromise = inflight.current.get(pubkey);
      if (existingPromise && !force) {
        return existingPromise;
      }

      const promise = (async () => {
        updateProfileEntry(pubkey, (entry) => ({
          status: "loading",
          data: entry?.data ?? null,
          error: null,
          fetchedAt: entry?.fetchedAt ?? null,
        }));
        try {
          const profile = await fetchProfileFromApi(pubkey);
          const record: CachedProfileEntry<BitcoinSquareProfile> = {
            profile,
            fetchedAt: Date.now(),
          };
          updateProfileEntry(pubkey, () => ({
            status: "success",
            data: profile,
            error: null,
            fetchedAt: record.fetchedAt,
          }));
          writeSessionProfile(pubkey, record);
          await writePersistedProfile(pubkey, record);
          return profile;
        } catch (error) {
          const message =
            error instanceof ProfileFetchError
              ? error.message
              : error instanceof Error
                ? error.message
                : PROFILE_FALLBACK_MESSAGE;
          if (import.meta.env?.DEV) {
            console.warn("Profile fetch failed", {
              pubkey,
              error,
            });
          }
          updateProfileEntry(pubkey, (entry) => ({
            status: "error",
            data: entry?.data ?? null,
            error: message ?? PROFILE_FALLBACK_MESSAGE,
            fetchedAt: Date.now(),
          }));
          return null;
        } finally {
          inflight.current.delete(pubkey);
        }
      })();

      inflight.current.set(pubkey, promise);
      return promise;
    },
    [updateProfileEntry],
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
    refresh: () => (pubkey ? refreshProfile(pubkey) : Promise.resolve(null)),
    isFollowing: pubkey ? isFollowing(pubkey) : false,
  };
};

export const shortenPubkey = shorten;
export const fallbackProfileAvatar = fallbackAvatar;
