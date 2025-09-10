export interface StrapiResponse<T> {
  data: T;
  meta?: unknown;
}

// Support both Node and browser environments. In the browser, Vite exposes env
// variables on `import.meta.env` while in Node tests we rely on `process.env`.
const env = (typeof process !== 'undefined' ? process.env : (import.meta as any).env) as {
  [key: string]: string | undefined;
};

export async function strapiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const base =
    env.VITE_STRAPI_URL || env.NEXT_PUBLIC_STRAPI_URL || env.VITE_API_URL || '';
  const headers = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  const res = await fetch(`${base}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<T>;
}
