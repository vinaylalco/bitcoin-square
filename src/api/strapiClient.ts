import { strapiFetch } from "./strapi-client";

export async function fetchStrapiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  return strapiFetch<T>(path, init);
}
