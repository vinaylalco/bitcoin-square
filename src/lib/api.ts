import { strapiFetch } from '../api/strapi-client';

// Generic API wrapper for Strapi requests
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return strapiFetch<T>(path, init);
}
