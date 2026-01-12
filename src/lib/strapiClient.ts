const DEFAULT_STRAPI_URL = 'https://headless.bitcoinsquare.io';

export class StrapiApiError extends Error {
  status: number;
  payload?: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = 'StrapiApiError';
    this.status = status;
    this.payload = payload;
  }
}

export type StrapiRequestOptions = RequestInit & {
  token?: string | null;
};

export function getStrapiBaseUrl(): string {
  const envUrl = import.meta.env?.VITE_STRAPI_URL;
  const base = envUrl && typeof envUrl === 'string' ? envUrl.trim() : '';
  const resolved = base.length > 0 ? base : DEFAULT_STRAPI_URL;
  return resolved.endsWith('/') ? resolved.slice(0, -1) : resolved;
}

export async function strapiRequest<T>(
  path: string,
  options: StrapiRequestOptions = {},
): Promise<T> {
  const baseUrl = getStrapiBaseUrl();
  const url = path.startsWith('http')
    ? path
    : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Unable to reach Strapi API',
    );
  }

  if (!response.ok) {
    let payload: unknown;
    let message = `Strapi request failed with status ${response.status}`;

    try {
      payload = await response.json();
      const payloadMessage =
        typeof payload === 'string'
          ? payload
          : (payload as { error?: { message?: string }; message?: string })?.error
              ?.message ??
            (payload as { error?: { message?: string }; message?: string })?.message;
      if (payloadMessage && typeof payloadMessage === 'string') {
        message = payloadMessage.trim() || message;
      }
    } catch {
      try {
        const text = await response.text();
        if (text.trim().length > 0) {
          message = text.trim();
        }
      } catch {
        // ignore parsing errors
      }
    }

    throw new StrapiApiError(response.status, message, payload);
  }

  if (response.status === 204) {
    return null as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return (await response.text()) as unknown as T;
}

export async function getMe<T>(token: string): Promise<T> {
  const response = await strapiRequest<unknown>(
    '/api/profile?fields[0]=grandfathered&fields[1]=membership_status',
    { token },
  );
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as { data: T }).data;
  }
  return response as T;
}
