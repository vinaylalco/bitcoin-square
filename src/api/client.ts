import axios from "axios";

export class ApiConfigError extends Error {
  constructor(message = "API base URL is not configured") {
    super(message);
    this.name = "ApiConfigError";
  }
}

const env = (typeof process !== "undefined" ? process.env : (import.meta as any).env) as Record<
  string,
  string | undefined
>;

export function getApiBaseUrl(): string | null {
  const candidates = [
    env.VITE_API_URL,
    env.NEXT_PUBLIC_API_URL,
    env.VITE_STRAPI_URL,
    env.NEXT_PUBLIC_STRAPI_URL,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  }

  return null;
}

const apiClient = axios.create({
  baseURL: getApiBaseUrl() ?? undefined,
  headers: {
    "Content-Type": "application/json",
  },
});

export function assertApiBaseUrl(): string {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new ApiConfigError();
  }

  if (apiClient.defaults.baseURL !== baseUrl) {
    apiClient.defaults.baseURL = baseUrl;
  }

  return baseUrl;
}

export default apiClient;
