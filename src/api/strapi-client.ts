export interface StrapiResponse<T> {
  data: T;
  meta?: unknown;
}

export class StrapiConfigError extends Error {
  constructor(message = 'Strapi base URL is not configured') {
    super(message);
    this.name = 'StrapiConfigError';
  }
}

export class StrapiNetworkError extends Error {
  constructor(message = 'Failed to reach Strapi API') {
    super(message);
    this.name = 'StrapiNetworkError';
  }
}

export class StrapiRequestError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'StrapiRequestError';
    this.status = status;
    this.payload = payload;
  }
}

// Support both Node and browser environments. In the browser, Vite exposes env
// variables on `import.meta.env` while in Node tests we rely on `process.env`.
const env = (typeof process !== 'undefined' ? process.env : (import.meta as any).env) as {
  [key: string]: string | undefined;
};

export function getStrapiBaseUrl(): string | null {
  const base =
    env.VITE_STRAPI_URL || env.NEXT_PUBLIC_STRAPI_URL || env.VITE_API_URL || '';
  const trimmed = base?.trim();
  if (!trimmed) return null;
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export async function strapiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const base = getStrapiBaseUrl();
  if (!base) {
    throw new StrapiConfigError();
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  const url = path.startsWith('http')
    ? path
    : `${base}${path.startsWith('/') ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (error) {
    throw new StrapiNetworkError(
      error instanceof Error ? error.message : 'Unknown Strapi fetch error',
    );
  }

  if (!response.ok) {
    let payload: unknown;
    let message = `Strapi request failed with status ${response.status}`;

    try {
      payload = await response.json();
      const extractedMessage =
        typeof payload === 'string'
          ? payload
          : (payload as { error?: { message?: string }; message?: string })?.error?.message ??
            (payload as { error?: { message?: string }; message?: string })?.message;
      if (extractedMessage && typeof extractedMessage === 'string' && extractedMessage.trim()) {
        message = extractedMessage.trim();
      }
    } catch {
      try {
        const text = await response.text();
        if (text && text.trim().length > 0) {
          message = text.trim();
        }
      } catch {
        // ignore secondary parsing errors
      }
    }

    throw new StrapiRequestError(message, response.status, payload);
  }

  return response.json() as Promise<T>;
}
