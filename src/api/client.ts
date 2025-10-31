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

function basePathContainsApiSegment(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/$/, "");
    return pathname === "/api" || pathname.startsWith("/api/");
  } catch (error) {
    if (error instanceof Error) {
      // Fall back to a simple substring check on the path portion only.
      const [, path = ""] = url.split(/https?:\/\//i);
      const normalizedPath = path.includes("/") ? path.slice(path.indexOf("/")) : "";
      const trimmed = normalizedPath.replace(/\/$/, "");
      return trimmed === "/api" || trimmed.startsWith("/api/");
    }
  }

  return false;
}

function joinPaths(...segments: string[]): string {
  return segments
    .filter((segment) => Boolean(segment) && segment !== "/")
    .map((segment, index) => {
      if (index === 0) {
        return segment.replace(/\/$/, "");
      }
      return segment.replace(/^\/+|\/+$/g, "");
    })
    .join("/");
}

export function resolveApiUrl(path: string): string {
  const baseUrl = assertApiBaseUrl();
  const trimmedPath = path.replace(/^\/+/, "");

  try {
    const parsed = new URL(baseUrl);
    const pathname = parsed.pathname.replace(/\/$/, "");

    if (basePathContainsApiSegment(baseUrl)) {
      parsed.pathname = joinPaths(pathname || "/", trimmedPath);
    } else {
      const apiPath = joinPaths(pathname || "/", "api", trimmedPath);
      parsed.pathname = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
    }

    return parsed.toString();
  } catch {
    const normalizedBase = baseUrl.replace(/\/$/, "");
    if (basePathContainsApiSegment(baseUrl)) {
      return `${normalizedBase}/${trimmedPath}`;
    }
    return `${normalizedBase}/api/${trimmedPath}`;
  }
}

export default apiClient;
