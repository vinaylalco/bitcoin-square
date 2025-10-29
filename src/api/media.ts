import { getStrapiBaseUrl, StrapiConfigError, StrapiNetworkError } from './strapi-client';

export interface UploadMediaResult {
  id: number | null;
  url: string;
  raw: unknown;
}

interface StrapiUploadEntry {
  id?: number | null;
  url?: string | null;
  [key: string]: unknown;
}

const toAbsoluteUrl = (base: string, url: string): string => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  if (!url.startsWith('/')) {
    return `${normalizedBase}/${url}`;
  }
  return `${normalizedBase}${url}`;
};

export const uploadProfileAvatar = async (file: File, jwt: string): Promise<UploadMediaResult> => {
  const baseUrl = getStrapiBaseUrl();
  if (!baseUrl) {
    throw new StrapiConfigError();
  }

  const headers: Record<string, string> = {};
  if (jwt && jwt.trim().length > 0) {
    headers.Authorization = `Bearer ${jwt}`;
  }

  const formData = new FormData();
  formData.append('files', file, file.name);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
  } catch (error) {
    throw new StrapiNetworkError(
      error instanceof Error ? error.message : 'Unknown Strapi upload error',
    );
  }

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }

  const payload = (await response.json()) as StrapiUploadEntry[] | null;
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('Upload succeeded but no media details were returned.');
  }

  const entry = payload[0] ?? null;
  const rawUrl = typeof entry?.url === 'string' ? entry.url.trim() : '';

  if (!rawUrl) {
    throw new Error('Upload succeeded but the file URL was missing.');
  }

  const absoluteUrl = toAbsoluteUrl(baseUrl, rawUrl);
  const id = typeof entry?.id === 'number' ? entry.id : null;

  return {
    id,
    url: absoluteUrl,
    raw: entry,
  };
};

