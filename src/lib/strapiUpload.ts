import { getStrapiBaseUrl, StrapiConfigError, StrapiRequestError } from '../api/strapi-client';

export type StrapiUploadMedia = {
  id?: number | string;
  url: string;
  alternativeText?: string | null;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
};

function normalizeMediaUrl(url: string, base: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('/')) {
    return `${base}${url}`;
  }
  return `${base}/${url}`;
}

export async function uploadToStrapi(file: File, token?: string): Promise<StrapiUploadMedia> {
  const base = getStrapiBaseUrl();
  if (!base) {
    throw new StrapiConfigError();
  }

  const formData = new FormData();
  formData.append('files', file);

  const response = await fetch(`${base}/api/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!response.ok) {
    let message = `Strapi upload failed with status ${response.status}`;
    let payload: unknown;
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
        // ignore
      }
    }
    throw new StrapiRequestError(message, response.status, payload);
  }

  const payload = await response.json();
  const uploaded = Array.isArray(payload) ? payload[0] : payload?.[0];
  if (!uploaded?.url) {
    throw new Error('Strapi upload response did not include media.');
  }

  return {
    id: uploaded.id,
    url: normalizeMediaUrl(uploaded.url, base),
    alternativeText: uploaded.alternativeText ?? null,
    caption: uploaded.caption ?? null,
    width: uploaded.width ?? null,
    height: uploaded.height ?? null,
  };
}
