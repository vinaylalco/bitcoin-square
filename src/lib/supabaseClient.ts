export type SupabaseAuthUser = {
  id: string;
  email?: string;
};

export type SupabaseAuthSession = {
  access_token: string;
  refresh_token: string;
} | null;

type SupabaseSignUpArgs = {
  email: string;
  password: string;
};

type SupabaseSignInWithPasswordArgs = {
  email: string;
  password: string;
};

type SupabaseAuthData = {
  user: SupabaseAuthUser | null;
  session: SupabaseAuthSession;
};

type SupabaseAuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT';

type SupabaseAuthListener = (event: SupabaseAuthEvent, data: SupabaseAuthData) => void;

type StoredSupabaseAuthState = SupabaseAuthData;

const SUPABASE_AUTH_STORAGE_KEY = 'distinctive.supabase.auth';
const listeners = new Set<SupabaseAuthListener>();

export class SupabaseAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SupabaseAuthError';
    this.status = status;
  }
}

function getSupabaseConfig(): { anonKey: string; url: string } {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new SupabaseAuthError(
      0,
      'Supabase signup is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }

  return {
    anonKey,
    url: url.endsWith('/') ? url.slice(0, -1) : url,
  };
}

function getSupabaseErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const message = record.msg ?? record.message ?? record.error_description ?? record.error;
  return typeof message === 'string' && message.trim().length > 0 ? message : null;
}

function emptyAuthData(): SupabaseAuthData {
  return { user: null, session: null };
}

function isStoredAuthState(value: unknown): value is StoredSupabaseAuthState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<StoredSupabaseAuthState>;
  return 'user' in record && 'session' in record;
}

function readStoredAuthState(): SupabaseAuthData {
  if (typeof window === 'undefined') {
    return emptyAuthData();
  }

  try {
    const raw = window.localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) {
      return emptyAuthData();
    }

    const parsed = JSON.parse(raw) as unknown;
    return isStoredAuthState(parsed) ? parsed : emptyAuthData();
  } catch {
    return emptyAuthData();
  }
}

function writeStoredAuthState(data: SupabaseAuthData): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (data.session && data.user) {
      window.localStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify(data));
    } else {
      window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors. Secrets and decrypted journal content are never stored here.
  }
}

function emitAuthStateChange(event: SupabaseAuthEvent, data: SupabaseAuthData): void {
  listeners.forEach((listener) => listener(event, data));
}

function persistSignedInState(data: SupabaseAuthData): void {
  writeStoredAuthState(data);
  emitAuthStateChange('SIGNED_IN', data);
}

async function signUp({ email, password }: SupabaseSignUpArgs): Promise<{
  data: SupabaseAuthData;
  error: SupabaseAuthError | null;
}> {
  const emptyData = emptyAuthData();

  let config: { anonKey: string; url: string };
  try {
    config = getSupabaseConfig();
  } catch (caught) {
    return {
      data: emptyData,
      error:
        caught instanceof SupabaseAuthError
          ? caught
          : new SupabaseAuthError(0, 'Supabase signup is not configured.'),
    };
  }

  let response: Response;
  try {
    response = await fetch(`${config.url}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return {
      data: emptyData,
      error: new SupabaseAuthError(0, 'Unable to reach Supabase. Please try again.'),
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      data: emptyData,
      error: new SupabaseAuthError(
        response.status,
        'Unable to create your account. Check your details and try again.',
      ),
    };
  }

  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const data = {
    user: (record.user ?? null) as SupabaseAuthUser | null,
    session: (record.session ?? null) as SupabaseAuthSession,
  };

  if (data.session && data.user) {
    persistSignedInState(data);
  }

  return {
    data,
    error: null,
  };
}

async function signInWithPassword({
  email,
  password,
}: SupabaseSignInWithPasswordArgs): Promise<{
  data: SupabaseAuthData;
  error: SupabaseAuthError | null;
}> {
  const emptyData = emptyAuthData();

  let config: { anonKey: string; url: string };
  try {
    config = getSupabaseConfig();
  } catch (caught) {
    return {
      data: emptyData,
      error:
        caught instanceof SupabaseAuthError
          ? caught
          : new SupabaseAuthError(0, 'Supabase login is not configured.'),
    };
  }

  let response: Response;
  try {
    response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return {
      data: emptyData,
      error: new SupabaseAuthError(0, 'Unable to reach Supabase. Please try again.'),
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      data: emptyData,
      error: new SupabaseAuthError(
        response.status,
        'Unable to log in. Please check your email and password.',
      ),
    };
  }

  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const accessToken = record.access_token;
  const refreshToken = record.refresh_token;
  const data = {
    user: (record.user ?? null) as SupabaseAuthUser | null,
    session:
      typeof accessToken === 'string' && typeof refreshToken === 'string'
        ? { access_token: accessToken, refresh_token: refreshToken }
        : null,
  };

  if (data.session && data.user) {
    persistSignedInState(data);
  }

  return {
    data,
    error: null,
  };
}

async function signOut(accessToken?: string | null): Promise<{ error: SupabaseAuthError | null }> {
  let config: { anonKey: string; url: string };
  try {
    config = getSupabaseConfig();
  } catch (caught) {
    writeStoredAuthState(emptyAuthData());
    emitAuthStateChange('SIGNED_OUT', emptyAuthData());
    return {
      error:
        caught instanceof SupabaseAuthError
          ? caught
          : new SupabaseAuthError(0, 'Supabase logout is not configured.'),
    };
  }

  writeStoredAuthState(emptyAuthData());
  emitAuthStateChange('SIGNED_OUT', emptyAuthData());

  if (!accessToken) {
    return { error: null };
  }

  try {
    const response = await fetch(`${config.url}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        error: new SupabaseAuthError(response.status, 'Unable to end the Supabase session.'),
      };
    }
  } catch {
    return {
      error: new SupabaseAuthError(0, 'Unable to reach Supabase. Please try again.'),
    };
  }

  return { error: null };
}

async function getSession(): Promise<{
  data: SupabaseAuthData;
  error: SupabaseAuthError | null;
}> {
  const data = readStoredAuthState();
  emitAuthStateChange('INITIAL_SESSION', data);
  return { data, error: null };
}

function onAuthStateChange(callback: SupabaseAuthListener): {
  data: { subscription: { unsubscribe: () => void } };
} {
  listeners.add(callback);

  return {
    data: {
      subscription: {
        unsubscribe: () => {
          listeners.delete(callback);
        },
      },
    },
  };
}

export type JournalEntryStatus = 'draft' | 'complete';

export type JournalEntryRow = {
  id: string;
  user_id: string;
  encrypted_payload: string;
  encryption_salt: string;
  iv: string;
  version: number;
  created_at: string;
  updated_at: string;
  display_title: string | null;
  status: JournalEntryStatus;
  completed_at: string | null;
};


const JOURNAL_ENTRY_SELECT = [
  'id',
  'encrypted_payload',
  'encryption_salt',
  'iv',
  'version',
  'status',
  'display_title',
  'created_at',
  'updated_at',
  'completed_at',
].join(',');

type JournalEntryWritePayload = {
  encrypted_payload: string;
  encryption_salt: string;
  iv: string;
  version: number;
  display_title: string;
  status: JournalEntryStatus;
  completed_at: string | null;
};

type JournalEntryInsertPayload = JournalEntryWritePayload & {
  user_id: string;
};

async function journalEntriesRequest<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: SupabaseAuthError | null }> {
  let config: { anonKey: string; url: string };
  try {
    config = getSupabaseConfig();
  } catch (caught) {
    return {
      data: null,
      error:
        caught instanceof SupabaseAuthError
          ? caught
          : new SupabaseAuthError(0, 'Supabase is not configured.'),
    };
  }

  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    return {
      data: null,
      error: new SupabaseAuthError(0, 'Unable to reach Supabase. Please try again.'),
    };
  }

  let payload: unknown = null;
  try {
    payload = response.status === 204 ? null : await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      data: null,
      error: new SupabaseAuthError(
        response.status,
        getSupabaseErrorMessage(payload) ?? 'Unable to save your journal entry. Please try again.',
      ),
    };
  }

  return { data: payload as T, error: null };
}

async function insertJournalEntry(
  accessToken: string,
  payload: JournalEntryInsertPayload,
): Promise<{ data: JournalEntryRow | null; error: SupabaseAuthError | null }> {
  const { data, error } = await journalEntriesRequest<JournalEntryRow[]>(
    accessToken,
    'journal_entries',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    },
  );

  return { data: data?.[0] ?? null, error };
}

async function updateJournalEntry(
  accessToken: string,
  entryId: string,
  payload: JournalEntryWritePayload,
): Promise<{ data: JournalEntryRow | null; error: SupabaseAuthError | null }> {
  const id = encodeURIComponent(entryId);
  const { data, error } = await journalEntriesRequest<JournalEntryRow[]>(
    accessToken,
    `journal_entries?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    },
  );

  return { data: data?.[0] ?? null, error };
}

async function getJournalEntryById(
  accessToken: string,
  entryId: string,
): Promise<{ data: JournalEntryRow | null; error: SupabaseAuthError | null }> {
  const id = encodeURIComponent(entryId);
  const select = encodeURIComponent(JOURNAL_ENTRY_SELECT);
  const { data, error } = await journalEntriesRequest<JournalEntryRow[]>(
    accessToken,
    `journal_entries?id=eq.${id}&select=${select}&limit=1`,
    { method: 'GET' },
  );

  return { data: data?.[0] ?? null, error };
}

async function getLatestDraftJournalEntry(
  accessToken: string,
  userId: string,
): Promise<{ data: JournalEntryRow | null; error: SupabaseAuthError | null }> {
  const select = encodeURIComponent(JOURNAL_ENTRY_SELECT);
  const user = encodeURIComponent(userId);
  const { data, error } = await journalEntriesRequest<JournalEntryRow[]>(
    accessToken,
    `journal_entries?user_id=eq.${user}&status=eq.draft&select=${select}&order=updated_at.desc&limit=1`,
    { method: 'GET' },
  );

  return { data: data?.[0] ?? null, error };
}

// The Supabase anon key is safe for browser use when Row Level Security is enabled correctly.
// Never expose the Supabase service role key in frontend code because it bypasses RLS.
export const supabase = {
  journalEntries: {
    getById: getJournalEntryById,
    getLatestDraft: getLatestDraftJournalEntry,
    insert: insertJournalEntry,
    update: updateJournalEntry,
  },
  auth: {
    getSession,
    onAuthStateChange,
    signInWithPassword,
    signOut,
    signUp,
  },
};
