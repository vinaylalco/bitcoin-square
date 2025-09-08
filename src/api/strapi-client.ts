export interface StrapiResponse<T> {
  data: T;
  meta?: unknown;
}

export async function strapiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = import.meta.env.VITE_STRAPI_URL;
  if (!base) throw new Error('VITE_STRAPI_URL not set');
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
    ...init,
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<T>;
}
