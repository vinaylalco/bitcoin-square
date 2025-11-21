import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { AuthResponse, RegisterOptions } from '../api/auth';
import {
  login as apiLogin,
  register as apiRegister,
  resetPassword as apiReset,
} from '../api/auth';
import {
  StrapiConfigError,
  StrapiNetworkError,
  strapiFetch,
} from '../api/strapi-client';
import { normalizeLessonCompletionList } from '../utils/localProgress';
import {
  decryptPrivateKey,
  encryptPrivateKey,
  generateNostrKeyPair,
} from '../utils/nostr';
import { fetchAccountNostrKeys, type AccountNostrKeyResponse } from '../api/nostrAccount';
import { normalizeAvatarUrl, normalizeScreenName } from '../utils/profileDefaults';

interface LessonCompletionMap {
  [slug: string]: string[];
}

interface UserPreferences {
  thunderSoundEnabled?: boolean;
  directMessagesLastViewedAt?: number;
  directMessagesLastViewedMessageId?: string | null;
  [key: string]: unknown;
}

export interface User {
  id: number;
  email: string;
  username?: string;
  screenName?: string | null;
  avatarUrl?: string | null;
  nostrPublicKey?: string;
  nostrEncryptedKey?: string;
  lnWalletAddress?: string | null;
  points: number;
  lessonCompletions: LessonCompletionMap;
  studyStreak: number;
  lastStudyDate: string | null;
  preferences?: UserPreferences;
  isAdmin: boolean;
}

type NostrKeyPayload = {
  nostrPublicKey?: string | null;
  nostrPrivateKey?: string | null;
  nostrEncryptedKey?: string | null;
};

const ADMIN_ROLE_KEYWORDS = ['admin', 'administrator', 'super-admin', 'superadmin', 'moderator'];

function matchesAdminKeyword(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return ADMIN_ROLE_KEYWORDS.some((keyword) =>
    normalized === keyword || normalized.includes(keyword),
  );
}

function hasAdminRole(candidate: unknown): boolean {
  if (!candidate) {
    return false;
  }
  if (Array.isArray(candidate)) {
    return candidate.some((entry) => hasAdminRole(entry));
  }
  if (typeof candidate === 'object') {
    const record = candidate as Record<string, unknown>;
    const directKeys = ['type', 'name', 'code', 'key', 'title', 'slug', 'value'];
    for (const key of directKeys) {
      if (matchesAdminKeyword(record[key])) {
        return true;
      }
    }
    if (matchesAdminKeyword(record.role)) {
      return true;
    }
    if (record.attributes && hasAdminRole(record.attributes)) {
      return true;
    }
    if (record.data && hasAdminRole(record.data)) {
      return true;
    }
    return Object.values(record).some((value) =>
      typeof value === 'string' ? matchesAdminKeyword(value) : false,
    );
  }
  return matchesAdminKeyword(candidate);
}

function normalizePoints(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeStudyStreak(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return 0;
}

function normalizeLastStudyDate(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return null;
}

function normalizeLessonCompletions(raw: unknown): LessonCompletionMap {
  if (!raw) return {};
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof value !== 'object' || value === null) return {};
  const result: LessonCompletionMap = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
    const entries = normalizeLessonCompletionList(val);
    if (entries.length > 0) {
      result[key] = entries;
    }
  });
  return result;
}

function normalizePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const input = raw as Record<string, unknown>;
  const prefs: UserPreferences = { ...input };
  if (typeof input.thunderSoundEnabled === 'boolean') {
    prefs.thunderSoundEnabled = input.thunderSoundEnabled;
  } else if (typeof input.thunderSoundEnabled === 'string') {
    if (input.thunderSoundEnabled.toLowerCase() === 'true') {
      prefs.thunderSoundEnabled = true;
    } else if (input.thunderSoundEnabled.toLowerCase() === 'false') {
      prefs.thunderSoundEnabled = false;
    }
  }

  const rawLastViewedAt = input.directMessagesLastViewedAt;
  if (typeof rawLastViewedAt === 'number' && Number.isFinite(rawLastViewedAt)) {
    prefs.directMessagesLastViewedAt = Math.max(0, Math.floor(rawLastViewedAt));
  } else if (typeof rawLastViewedAt === 'string' && rawLastViewedAt.trim().length > 0) {
    const parsed = Number(rawLastViewedAt.trim());
    if (Number.isFinite(parsed)) {
      prefs.directMessagesLastViewedAt = Math.max(0, Math.floor(parsed));
    }
  }

  const rawLastViewedId = input.directMessagesLastViewedMessageId;
  if (typeof rawLastViewedId === 'string') {
    const trimmed = rawLastViewedId.trim();
    prefs.directMessagesLastViewedMessageId = trimmed.length > 0 ? trimmed : null;
  } else if (rawLastViewedId == null) {
    prefs.directMessagesLastViewedMessageId = null;
  }

  return prefs;
}

function normalizeLightningAddress(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value !== 0;
    }
    return false;
  }
  return false;
}

function computeIsAdmin(raw: any): boolean {
  if (!raw || typeof raw !== 'object') {
    return false;
  }
  const booleanCandidates = [
    raw.isAdmin,
    raw.admin,
    raw.is_admin,
    raw.isModerator,
    raw.moderator,
    raw.canModerate,
  ];
  if (booleanCandidates.some((candidate) => normalizeBoolean(candidate))) {
    return true;
  }
  const roleCandidates = [raw.role, raw.roles, raw.userRole, raw.userRoles];
  if (roleCandidates.some((candidate) => hasAdminRole(candidate))) {
    return true;
  }
  return false;
}

function normalizeUser(raw: any | null | undefined): User | null {
  if (!raw) return null;
  const seedSource =
    (typeof raw.nostrPublicKey === 'string' && raw.nostrPublicKey.trim().length > 0
      ? raw.nostrPublicKey
      : '') ||
    (raw.id != null ? String(raw.id) : '') ||
    (typeof raw.email === 'string' ? raw.email : '');
  const normalized: User = {
    ...raw,
    isAdmin: computeIsAdmin(raw),
    points: normalizePoints(raw.points),
    lessonCompletions: normalizeLessonCompletions(raw.lessonCompletions),
    studyStreak: normalizeStudyStreak(raw.studyStreak),
    lastStudyDate: normalizeLastStudyDate(raw.lastStudyDate),
    preferences: normalizePreferences(raw.preferences),
    lnWalletAddress: normalizeLightningAddress(raw.lnWalletAddress ?? raw.lightningAddress),
    screenName: normalizeScreenName(raw.screenName ?? raw.displayName ?? raw.username, seedSource),
    avatarUrl: normalizeAvatarUrl(
      raw.avatarUrl ?? raw.profileImage ?? raw.image ?? raw.picture,
      seedSource,
    ),
  };
  if (!normalized.lessonCompletions) {
    normalized.lessonCompletions = {};
  }
  if (!normalized.lastStudyDate) {
    normalized.lastStudyDate = null;
  }
  if (!normalized.preferences) {
    normalized.preferences = {};
  }
  return normalized;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  nostrPrivKey: string | null;
  nostrKeyLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    options?: RegisterOptions,
  ) => Promise<AuthResponse>;
  completeAuthFromResponse: (
    res: AuthResponse,
    options?: { passphrases?: string[] },
  ) => Promise<void>;
  logout: () => void;
  reset: (code: string, password: string, confirm: string) => Promise<void>;
  updateUser: (updater: (prev: User | null) => User | null) => void;
  refreshNostrKeys: () => Promise<void>;
}

const AuthCtx = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? normalizeUser(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('jwt');
    } catch {
      return null;
    }
  });
  const [nostrPrivKey, setNostrPrivKey] = useState<string | null>(() => {
    try {
      return localStorage.getItem('nostrPrivKey');
    } catch {
      return null;
    }
  });
  const [nostrKeyLoading, setNostrKeyLoading] = useState(false);
  const [profileHydrated, setProfileHydrated] = useState(false);

  useEffect(() => {
    if (!token) return;
    // In a full implementation we could verify the token here.
  }, [token]);

  useEffect(() => {
    setProfileHydrated(false);
  }, [token]);

  const updateUser = useCallback((updater: (prev: User | null) => User | null) => {
    setUser((prev) => {
      const next = normalizeUser(updater(prev));
      try {
        if (next) {
          localStorage.setItem('user', JSON.stringify(next));
        } else {
          localStorage.removeItem('user');
        }
      } catch {}
      return next;
    });
  }, []);

  const persistNostrPrivKey = useCallback((priv: string) => {
    setNostrPrivKey(priv);
    try {
      localStorage.setItem('nostrPrivKey', priv);
    } catch {}
  }, []);

  const applyFetchedNostrKeys = useCallback(
    async (
      response: (AccountNostrKeyResponse | NostrKeyPayload) | null | undefined,
      options: { passphrases?: string[]; fallbackUser?: AuthResponse['user'] | null } = {},
    ): Promise<boolean> => {
      if (!response) {
        return false;
      }

      const { passphrases = [], fallbackUser = null } = options;
      const normalizedPassphrases = passphrases
        .map((value) => value?.trim())
        .filter((value, index, array): value is string => !!value && array.indexOf(value) === index);

      const { nostrPublicKey, nostrEncryptedKey, nostrPrivateKey } = response;

      if (nostrPublicKey || nostrEncryptedKey) {
        updateUser((prev) => {
          if (prev) {
            const next: User = { ...prev };
            if (nostrPublicKey) {
              next.nostrPublicKey = nostrPublicKey;
            }
            if (nostrEncryptedKey) {
              next.nostrEncryptedKey = nostrEncryptedKey;
            }
            return next;
          }
          if (!fallbackUser) {
            return prev;
          }
          return normalizeUser({
            ...fallbackUser,
            ...(nostrPublicKey ? { nostrPublicKey } : {}),
            ...(nostrEncryptedKey ? { nostrEncryptedKey } : {}),
          });
        });
      }

      if (typeof nostrPrivateKey === 'string' && nostrPrivateKey.trim().length > 0) {
        const priv = nostrPrivateKey.trim();
        persistNostrPrivKey(priv);
        return true;
      }

      if (typeof nostrEncryptedKey === 'string' && nostrEncryptedKey.trim().length > 0) {
        let lastError: unknown = null;
        for (const candidate of normalizedPassphrases) {
          try {
            const priv = await decryptPrivateKey(nostrEncryptedKey, candidate);
            if (priv && priv.trim().length > 0) {
              persistNostrPrivKey(priv.trim());
              return true;
            }
          } catch (error) {
            lastError = error;
          }
        }
        if (lastError && normalizedPassphrases.length > 0) {
          console.warn('Failed to decrypt nostr key with provided passphrases', lastError);
        }
      }

      return false;
    },
    [persistNostrPrivKey, updateUser],
  );

  const refreshNostrKeys = useCallback(async () => {
    if (!user || !token) return;
    setNostrKeyLoading(true);
    try {
      const response = await fetchAccountNostrKeys(user.id, token);
      await applyFetchedNostrKeys(response, { passphrases: token ? [token] : undefined });
    } catch (error) {
      if (error instanceof StrapiNetworkError) {
        console.info('Skipping nostr key refresh: Strapi API is unreachable.');
      } else {
        console.warn('Failed to refresh nostr keys', error);
      }
    } finally {
      setNostrKeyLoading(false);
    }
  }, [applyFetchedNostrKeys, token, user]);

  function applyAuth(res: AuthResponse) {
    const normalized = normalizeUser(res.user);
    setUser(normalized);
    setToken(res.jwt);
    try {
      localStorage.setItem('jwt', res.jwt);
      if (normalized) {
        localStorage.setItem('user', JSON.stringify(normalized));
      } else {
        localStorage.removeItem('user');
      }
    } catch {}
  }

  async function login(email: string, password: string) {
    setNostrKeyLoading(true);
    try {
      const res = await apiLogin(email, password);
      await completeAuthFromResponse(res, { passphrases: [password, res.jwt] });
    } finally {
      setNostrKeyLoading(false);
    }
  }

  const completeAuthFromResponse = useCallback(
    async (res: AuthResponse, options: { passphrases?: string[] } = {}) => {
      setNostrKeyLoading(true);
      try {
        applyAuth(res);
        const passphrases = (options.passphrases ?? [])
          .map((value) => value?.trim())
          .filter((value, index, array): value is string => !!value && array.indexOf(value) === index);
        let applied = await applyFetchedNostrKeys(res.user, {
          passphrases,
          fallbackUser: res.user,
        });
        if (!applied) {
          try {
            const fetched = await fetchAccountNostrKeys(res.user.id, res.jwt);
            applied = await applyFetchedNostrKeys(fetched, {
              passphrases,
              fallbackUser: res.user,
            });
            if (!applied) {
              console.warn('Unable to hydrate BitcoinSquare Nostr keys after authentication.');
            }
          } catch (error) {
            if (error instanceof StrapiNetworkError) {
              console.info('Skipping nostr key fetch: Strapi API is unreachable.');
            } else {
              console.warn('Failed to fetch nostr keys after authentication', error);
            }
          }
        }
      } finally {
        setNostrKeyLoading(false);
      }
    },
    [applyFetchedNostrKeys],
  );

  async function register(email: string, password: string, options: RegisterOptions = {}) {
    setNostrKeyLoading(true);
    try {
      const res = await apiRegister(email, password, options);
      const { pub, priv } = generateNostrKeyPair();
      persistNostrPrivKey(priv);
      const body: Record<string, unknown> = {
        nostrPublicKey: pub,
        nostrEncryptedKey: await encryptPrivateKey(priv, password),
      };
      await strapiFetch(`/api/users/${res.user.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${res.jwt}` },
        body: JSON.stringify(body),
      });
      return {
        ...res,
        user: {
          ...res.user,
          ...body,
        },
      };
    } finally {
      setNostrKeyLoading(false);
    }
  }

  async function reset(code: string, password: string, confirm: string) {
    setNostrKeyLoading(true);
    try {
      let res = await apiReset(code, password, confirm);

      let nostrEncryptedKey: string | undefined;

      try {
        const fetchedKeys = await fetchAccountNostrKeys(res.user.id, res.jwt);
        if (fetchedKeys?.nostrEncryptedKey?.trim()) {
          nostrEncryptedKey = fetchedKeys.nostrEncryptedKey.trim();
        }
      } catch (error) {
        console.warn('Failed to fetch nostr keys after password reset', error);
      }

      if (nostrPrivKey?.trim()) {
        const reencrypted = await encryptPrivateKey(nostrPrivKey.trim(), password);

        try {
          await strapiFetch(`/api/users/${res.user.id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${res.jwt}` },
            body: JSON.stringify({ nostrEncryptedKey: reencrypted }),
          });

          nostrEncryptedKey = reencrypted;
        } catch (error) {
          console.warn('Failed to re-encrypt nostr key after password reset', error);
        }
      }

      if (nostrEncryptedKey) {
        res = {
          ...res,
          user: {
            ...res.user,
            nostrEncryptedKey,
          },
        };
      }

      await completeAuthFromResponse(res, { passphrases: [password, res.jwt] });
    } finally {
      setNostrKeyLoading(false);
    }
  }

  function logout() {
    setUser(null);
    setToken(null);
    setNostrPrivKey(null);
    setNostrKeyLoading(false);
    setProfileHydrated(false);
    try {
      localStorage.removeItem('jwt');
      localStorage.removeItem('user');
      localStorage.removeItem('nostrPrivKey');
    } catch {}
  }

  useEffect(() => {
    if (!user || !token) return;
    if (nostrPrivKey || nostrKeyLoading) return;
    refreshNostrKeys().catch(() => undefined);
  }, [nostrPrivKey, nostrKeyLoading, refreshNostrKeys, token, user]);

  useEffect(() => {
    if (!user || !token) {
      return;
    }
    if (profileHydrated) {
      return;
    }

    let cancelled = false;

    const hydrateProfile = async () => {
      try {
        const me = await strapiFetch<any>(
          '/api/users/me?populate=role',
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (cancelled) {
          return;
        }
        if (me && typeof me === 'object') {
          updateUser((prev) => {
            if (!prev) {
              return me;
            }
            const merged: Record<string, unknown> = { ...prev };
            Object.entries(me as Record<string, unknown>).forEach(([key, value]) => {
              if (value !== undefined) {
                merged[key] = value;
              }
            });
            return merged;
          });
        }
      } catch (error) {
        if (error instanceof StrapiConfigError) {
          console.info('Skipping user hydration: Strapi base URL is not configured.');
        } else if (error instanceof StrapiNetworkError) {
          console.info('Skipping user hydration: Strapi API is unreachable.');
        } else {
          console.warn('Failed to hydrate authenticated user', error);
        }
      } finally {
        if (!cancelled) {
          setProfileHydrated(true);
        }
      }
    };

    hydrateProfile().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [profileHydrated, token, updateUser, user]);

  return (
    <AuthCtx.Provider
      value={{
        user,
        token,
        nostrPrivKey,
        nostrKeyLoading,
        login,
        register,
        completeAuthFromResponse,
        logout,
        reset,
        updateUser,
        refreshNostrKeys,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

