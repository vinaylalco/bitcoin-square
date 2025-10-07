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

export interface BitcoinSquareProfile {
  pubkey: string;
  displayName: string;
  avatarUrl: string;
  joined: string | null;
  totalPosts: number | null;
  reputationScore: number | null;
  rank: string | null;
  badges: string[];
  achievements?: string[];
  lightningAddress: string | null;
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
  startDirectMessage: (pubkey: string) => void;
  shortenPubkey: (pubkey: string) => string;
  fallbackAvatar: (pubkey: string) => string;
}

const ProfileIdentityContext = createContext<ProfileIdentityContextValue | null>(null);

const shorten = (value: string) => `${value.slice(0, 8)}…${value.slice(-8)}`;

const fallbackAvatar = (pubkey: string) => `https://www.gravatar.com/avatar/${pubkey}?d=identicon`;

const profileUrl = (pubkey: string) => `https://bitcoinsquare.io/profile/${pubkey}`;

const FOLLOWING_STORAGE_KEY = "bitcoin-square-following";
const CACHE_TTL = 1000 * 60 * 15; // 15 minutes

const normalizeProfile = (pubkey: string, payload: Partial<BitcoinSquareProfile>): BitcoinSquareProfile => {
  const badges = Array.isArray(payload.badges)
    ? payload.badges
    : Array.isArray(payload.achievements)
      ? payload.achievements
      : [];
  return {
    pubkey,
    displayName: payload.displayName ?? shorten(pubkey),
    avatarUrl: payload.avatarUrl ?? fallbackAvatar(pubkey),
    joined: payload.joined ?? null,
    totalPosts:
      typeof payload.totalPosts === "number" && Number.isFinite(payload.totalPosts)
        ? payload.totalPosts
        : null,
    reputationScore:
      typeof payload.reputationScore === "number" && Number.isFinite(payload.reputationScore)
        ? payload.reputationScore
        : null,
    rank: payload.rank ?? null,
    badges,
    achievements: payload.achievements,
    lightningAddress:
      typeof payload.lightningAddress === "string" && payload.lightningAddress.trim().length > 0
        ? payload.lightningAddress.trim()
        : null,
  };
};

const loadFollowingFromStorage = (): Set<string> => {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(FOLLOWING_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch (error) {
    console.warn("Failed to parse following list", error);
    return new Set();
  }
};

const persistFollowing = (following: Set<string>) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FOLLOWING_STORAGE_KEY, JSON.stringify(Array.from(following)));
  } catch (error) {
    console.warn("Unable to persist following list", error);
  }
};

const fetchProfileFromApi = async (pubkey: string): Promise<BitcoinSquareProfile> => {
  const response = await fetch(`https://bitcoinsquare.io/api/users/${pubkey}`);
  if (!response.ok) {
    throw new Error(`Profile request failed with status ${response.status}`);
  }
  const json = (await response.json()) as Partial<BitcoinSquareProfile>;
  return normalizeProfile(pubkey, json);
};

export const formatMemberSince = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "long",
    }).format(date);
  } catch (error) {
    console.warn("Failed to format member since", error);
    return date.toLocaleDateString();
  }
};

export const ProfileIdentityProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [profiles, setProfiles] = useState<Record<string, ProfileEntry>>({});
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const profilesRef = useRef(profiles);
  const inflight = useRef(new Map<string, Promise<BitcoinSquareProfile | null>>() );
  const [following, setFollowing] = useState<Set<string>>(() => loadFollowingFromStorage());

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    persistFollowing(following);
  }, [following]);

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
          const message = error instanceof Error ? error.message : "Unable to load profile";
          updateProfileEntry(pubkey, (entry) => ({
            status: "error",
            data: entry?.data ?? null,
            error: message,
            fetchedAt: Date.now(),
          }));
          throw error;
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
      return {
        displayName: data?.displayName ?? shorten(pubkey),
        avatarUrl: data?.avatarUrl ?? fallbackAvatar(pubkey),
        profileUrl: profileUrl(pubkey),
        lightningAddress: data?.lightningAddress ?? null,
      };
    },
    [],
  );

  const follow = useCallback((pubkey: string) => {
    setFollowing((prev) => {
      if (prev.has(pubkey)) return prev;
      const next = new Set(prev);
      next.add(pubkey);
      return next;
    });
  }, []);

  const unfollow = useCallback((pubkey: string) => {
    setFollowing((prev) => {
      if (!prev.has(pubkey)) return prev;
      const next = new Set(prev);
      next.delete(pubkey);
      return next;
    });
  }, []);

  const toggleFollow = useCallback(
    (pubkey: string) => {
      setFollowing((prev) => {
        const next = new Set(prev);
        if (next.has(pubkey)) {
          next.delete(pubkey);
        } else {
          next.add(pubkey);
        }
        return next;
      });
    },
    [],
  );

  const isFollowing = useCallback((pubkey: string) => following.has(pubkey), [following]);

  const startDirectMessage = useCallback((pubkey: string) => {
    if (typeof window === "undefined") return;
    const event = new CustomEvent("nostr:dm", { detail: { pubkey } });
    window.dispatchEvent(event);
    const nostrUri = `nostr:dm/${pubkey}`;
    try {
      window.open(nostrUri, "_blank");
    } catch (error) {
      console.warn("Unable to open DM link", error);
    }
  }, []);

  const openProfile = useCallback((pubkey: string) => {
    setActiveProfile(pubkey);
  }, []);

  const closeProfile = useCallback(() => {
    setActiveProfile(null);
  }, []);

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
