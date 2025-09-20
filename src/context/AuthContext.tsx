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
import { strapiFetch } from '../api/strapi-client';
import { normalizeLessonCompletionList } from '../utils/localProgress';
import {
  decryptPrivateKey,
  encryptPrivateKey,
  generateNostrKeyPair,
} from '../utils/nostr';

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
  nostrPrivateKey?: string;
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

function normalizePrivateKey(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
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
  const privateKey = normalizePrivateKey(raw.nostrPrivateKey);
  if (privateKey) {
    normalized.nostrPrivateKey = privateKey;
  } else {
    normalized.nostrPrivateKey = undefined;
  }
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
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, storeRecovery: boolean) => Promise<void>;
  logout: () => void;
  reset: (code: string, password: string, confirm: string) => Promise<void>;
  updateUser: (updater: (prev: User | null) => User | null) => void;
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

  const persistNostrPrivKey = useCallback(
    (value: string | null) => {
      setNostrPrivKey(value);
      try {
        if (value) {
          localStorage.setItem('nostrPrivKey', value);
        } else {
          localStorage.removeItem('nostrPrivKey');
        }
      } catch {}
    },
    [setNostrPrivKey],
  );

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
    if (normalized?.nostrPrivateKey) {
      persistNostrPrivKey(normalized.nostrPrivateKey);
    }
  }

  async function login(email: string, password: string) {
    const res = await apiLogin(email, password);
    applyAuth(res);
    const plainKey = normalizePrivateKey(res.user.nostrPrivateKey);
    if (plainKey) {
      persistNostrPrivKey(plainKey);
      return;
    }
    if (res.user.nostrEncryptedKey) {
      try {
        const priv = await decryptPrivateKey(res.user.nostrEncryptedKey, password);
        persistNostrPrivKey(priv);
        return;
      } catch {}
    }
    if (!res.user.nostrEncryptedKey && !plainKey) {
      persistNostrPrivKey(null);
    }
  }

  async function register(email: string, password: string, storeRecovery: boolean) {
    const res = await apiRegister(email, password);
    applyAuth(res);
    const { pub, priv } = generateNostrKeyPair();
    persistNostrPrivKey(priv);
    const body: Record<string, unknown> = { nostrPublicKey: pub };
    if (storeRecovery) {
      body.nostrEncryptedKey = await encryptPrivateKey(priv, password);
    }
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
    const plainKey = normalizePrivateKey(res.user.nostrPrivateKey);
    if (plainKey) {
      persistNostrPrivKey(plainKey);
      return;
    }
    if (res.user.nostrEncryptedKey) {
      try {
        const priv = await decryptPrivateKey(res.user.nostrEncryptedKey, password);
        persistNostrPrivKey(priv);
        return;
      } catch {}
    }
    if (!res.user.nostrEncryptedKey && !plainKey) {
      persistNostrPrivKey(null);
    }
  }

  function logout() {
    setUser(null);
    setToken(null);
    persistNostrPrivKey(null);
    try {
      localStorage.removeItem('jwt');
      localStorage.removeItem('user');
    } catch {}
  }

  useEffect(() => {
    if (!user) return;
    const normalizedPriv = normalizePrivateKey(user.nostrPrivateKey);
    if (normalizedPriv && normalizedPriv !== nostrPrivKey) {
      persistNostrPrivKey(normalizedPriv);
    }
  }, [user, nostrPrivKey, persistNostrPrivKey]);

  return (
    <AuthCtx.Provider
      value={{ user, token, nostrPrivKey, login, register, logout, reset, updateUser }}
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

