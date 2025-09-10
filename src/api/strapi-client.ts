export interface StrapiResponse<T> {
  data: T;
  meta?: unknown;
}

// Support both Node and browser environments. In the browser, Vite exposes env
// variables on `import.meta.env` while in Node tests we rely on `process.env`.
const env = (typeof process !== 'undefined' ? process.env : (import.meta as any).env) as {
  [key: string]: string | undefined;
};

export async function strapiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = env.VITE_STRAPI_URL || env.NEXT_PUBLIC_STRAPI_URL || env.VITE_API_URL || '';
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') : undefined;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers || {}),
  };
  const res = await fetch(`${base}${path}`, { ...init, headers });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const err = await res.json();
      message = (err as any)?.error?.message || message;
    } catch {
      // ignore JSON parse errors and fall back to status text
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}
