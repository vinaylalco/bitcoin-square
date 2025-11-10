const env = (typeof process !== "undefined" ? process.env : (import.meta as any).env) as {
  [key: string]: string | undefined;
};

const DEFAULT_HEADLESS_BASE_URL = "https://headless.bitcoinsquare.io";
const DEFAULT_HEADLESS_API_TOKEN =
  "ad4ee300c367f1d9343a0e5d30d744c88f09449e787be9c7a27bdc19ad38e40de1619651e710d1e2583c3d440a473fdee8712f3a98d03eb284f16f8405404313e30f9eb7f6c3e67a4a3e4943f84a00ad1ee6652e95d678aa973056cef7490b64b253921a251db917f3719b356418609ce15eccf4e157c2447f14cc2da6e4dd17";

export class HeadlessConfigError extends Error {
  constructor(message = "Headless API configuration is not available") {
    super(message);
    this.name = "HeadlessConfigError";
  }
}

export class HeadlessNetworkError extends Error {
  constructor(message = "Failed to reach Headless API") {
    super(message);
    this.name = "HeadlessNetworkError";
  }
}

export class HeadlessRequestError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "HeadlessRequestError";
    this.status = status;
    this.payload = payload;
  }
}

export function getHeadlessBaseUrl(): string {
  const base = env.VITE_HEADLESS_API_URL || env.NEXT_PUBLIC_HEADLESS_API_URL || DEFAULT_HEADLESS_BASE_URL;
  const trimmed = base?.trim();
  const normalized = trimmed?.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  if (!normalized) {
    throw new HeadlessConfigError();
  }
  return normalized;
}

export function getHeadlessApiToken(): string {
  const token =
    env.VITE_HEADLESS_API_TOKEN ||
    env.NEXT_PUBLIC_HEADLESS_API_TOKEN ||
    env.HEADLESS_API_TOKEN ||
    DEFAULT_HEADLESS_API_TOKEN;
  const trimmed = token?.trim();
  if (!trimmed) {
    throw new HeadlessConfigError("Headless API token is not configured");
  }
  return trimmed;
}

export function isHeadlessApiConfigured(): boolean {
  try {
    return Boolean(getHeadlessBaseUrl()) && Boolean(getHeadlessApiToken());
  } catch {
    return false;
  }
}

export async function fetchActiveMemberCount(): Promise<number> {
  return fetchHeadlessCount("/api/users/count", "active member");
}

export async function fetchLessonPlanCount(): Promise<number> {
  return fetchHeadlessCount("/api/lessonplans/count", "lesson plan");
}

async function fetchHeadlessCount(path: string, contextLabel: string): Promise<number> {
  const base = getHeadlessBaseUrl();
  const token = getHeadlessApiToken();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${normalizedPath}`;

  const headers = initHeadersWithAuth(token);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers,
    });
  } catch (error) {
    throw new HeadlessNetworkError(
      error instanceof Error ? error.message : "Unknown Headless fetch error",
    );
  }

  if (!response.ok) {
    let payload: unknown;
    let message = `Headless request failed with status ${response.status}`;

    try {
      payload = await response.json();
      const extractedMessage =
        typeof payload === "string"
          ? payload
          : (payload as { error?: { message?: string }; message?: string })?.error?.message ??
            (payload as { error?: { message?: string }; message?: string })?.message;
      if (extractedMessage && typeof extractedMessage === "string" && extractedMessage.trim()) {
        message = extractedMessage.trim();
      }
    } catch {
      try {
        const text = await response.text();
        if (text && text.trim().length > 0) {
          message = text.trim();
        }
      } catch {
        // ignore parsing errors
      }
    }

    throw new HeadlessRequestError(message, response.status, payload);
  }

  const raw = await response.text();
  const parsed = parseCount(raw);
  if (parsed == null) {
    throw new HeadlessRequestError(`Unable to parse ${contextLabel} count`, response.status);
  }

  return parsed;
}

function initHeadersWithAuth(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
  };
}

function parseCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (/^["[{]/.test(trimmed)) {
    try {
      const data = JSON.parse(trimmed);
      if (typeof data === "number" && Number.isFinite(data)) {
        return data;
      }
      if (data && typeof data === "object") {
        const possibleCount =
          (data as { count?: unknown }).count ??
          (data as { data?: unknown }).data ??
          (data as { value?: unknown }).value;
        if (typeof possibleCount === "number" && Number.isFinite(possibleCount)) {
          return possibleCount;
        }
        if (typeof possibleCount === "string") {
          const numeric = Number.parseInt(possibleCount, 10);
          if (Number.isFinite(numeric)) {
            return numeric;
          }
        }
      }
    } catch {
      // fall through to numeric parsing below
    }
  }

  const numeric = Number.parseInt(trimmed, 10);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return null;
}
