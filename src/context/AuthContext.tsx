import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { AuthResponse } from '../api/auth';
import {
  login as apiLogin,
  register as apiRegister,
  resetPassword as apiReset,
} from '../api/auth';
import {
  StrapiNetworkError,
  strapiFetch,
} from '../api/strapi-client';
import { normalizeLessonCompletionList } from '../utils/localProgress';
import {
  decryptPrivateKey,
  encryptPrivateKey,
  generateNostrKeyPair,
} from '../utils/nostr';
import { fetchAccountNostrKeys } from '../api/nostrAccount';

interface LessonCompletionMap {
  [slug: string]: string[];
}

interface UserPreferences {
  thunderSoundEnabled?: boolean;
  [key: string]: unknown;
}

export interface User {
  id: number;
  email: string;
  username?: string;
  nostrPublicKey?: string;
  nostrEncryptedKey?: string;
  points: number;
  lessonCompletions: LessonCompletionMap;
  studyStreak: number;
  lastStudyDate: string | null;
  preferences?: UserPreferences;
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
  return prefs;
}

function normalizeUser(raw: any | null | undefined): User | null {
  if (!raw) return null;
  const normalized: User = {
    ...raw,
    points: normalizePoints(raw.points),
    lessonCompletions: normalizeLessonCompletions(raw.lessonCompletions),
    studyStreak: normalizeStudyStreak(raw.studyStreak),
    lastStudyDate: normalizeLastStudyDate(raw.lastStudyDate),
    preferences: normalizePreferences(raw.preferences),
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
  register: (email: string, password: string) => Promise<void>;
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

  useEffect(() => {
    if (!token) return;
    // In a full implementation we could verify the token here.
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

  const refreshNostrKeys = useCallback(async () => {
    if (!user || !token) return;
    setNostrKeyLoading(true);
    try {
      const response = await fetchAccountNostrKeys(user.id, token);
      if (!response) {
        return;
      }
      if (response?.nostrPublicKey && response.nostrPublicKey !== user.nostrPublicKey) {
        updateUser((prev) => (prev ? { ...prev, nostrPublicKey: response.nostrPublicKey } : prev));
      }
      if (response?.nostrPrivateKey) {
        setNostrPrivKey(response.nostrPrivateKey);
        try {
          localStorage.setItem('nostrPrivKey', response.nostrPrivateKey);
        } catch {}
      }
      if (!response?.nostrPrivateKey && response?.nostrEncryptedKey) {
        try {
          const priv = await decryptPrivateKey(response.nostrEncryptedKey, token);
          setNostrPrivKey(priv);
          try {
            localStorage.setItem('nostrPrivKey', priv);
          } catch {}
        } catch (error) {
          console.warn('Failed to decrypt nostr key from response', error);
        }
      }
    } catch (error) {
      if (error instanceof StrapiNetworkError) {
        console.info('Skipping nostr key refresh: Strapi API is unreachable.');
      } else {
        console.warn('Failed to refresh nostr keys', error);
      }
    } finally {
      setNostrKeyLoading(false);
    }
  }, [token, updateUser, user]);

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
    const res = await apiLogin(email, password);
    applyAuth(res);
    if (res.user.nostrEncryptedKey) {
      try {
        const priv = await decryptPrivateKey(res.user.nostrEncryptedKey, password);
        setNostrPrivKey(priv);
        try {
          localStorage.setItem('nostrPrivKey', priv);
        } catch {}
        setNostrKeyLoading(false);
      } catch {}
    } else {
      await refreshNostrKeys();
    }
  }

  async function register(email: string, password: string) {
    const res = await apiRegister(email, password);
    applyAuth(res);
    const { pub, priv } = generateNostrKeyPair();
    setNostrPrivKey(priv);
    setNostrKeyLoading(false);
    try {
      localStorage.setItem('nostrPrivKey', priv);
    } catch {}
    const body: Record<string, unknown> = {
      nostrPublicKey: pub,
      nostrEncryptedKey: await encryptPrivateKey(priv, password),
    };
    await strapiFetch(`/api/users/${res.user.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${res.jwt}` },
      body: JSON.stringify(body),
    });
    updateUser((prev) => (prev ? { ...prev, ...body } : prev));
  }

  async function reset(code: string, password: string, confirm: string) {
    const res = await apiReset(code, password, confirm);
    applyAuth(res);
  }

  function logout() {
    setUser(null);
    setToken(null);
    setNostrPrivKey(null);
    setNostrKeyLoading(false);
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

  return (
    <AuthCtx.Provider
      value={{
        user,
        token,
        nostrPrivKey,
        nostrKeyLoading,
        login,
        register,
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

