import safeJsonFetch from "../utils/safeJsonFetch";

const DEFAULT_HEADLESS_BASE_URL = "https://headless.bitcoinsquare.io";

const env = (typeof process !== "undefined" ? process.env : (import.meta as any).env) as {
  [key: string]: string | undefined;
};

const resolveHeadlessBaseUrl = (): string => {
  const candidate =
    env.VITE_HEADLESS_API_URL ||
    env.VITE_HEADLESS_URL ||
    env.NEXT_PUBLIC_HEADLESS_API_URL ||
    env.HEADLESS_API_URL ||
    env.VITE_HEADLESS_BASE_URL ||
    "";
  const trimmed = candidate.trim();
  if (!trimmed) {
    return DEFAULT_HEADLESS_BASE_URL;
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const HEADLESS_BASE_URL = resolveHeadlessBaseUrl();

export interface MembershipAttributes {
  status?: string | null;
  active?: boolean | null;
  expiresAt?: string | null;
  endsAt?: string | null;
  endDate?: string | null;
  [key: string]: unknown;
}

export interface MembershipEntry {
  id: number;
  attributes?: MembershipAttributes | null;
  [key: string]: unknown;
}

interface StrapiCollectionResponse<T> {
  data?: T[] | null;
  meta?: unknown;
}

export const buildMembershipStatusUrl = (email: string): string => {
  const normalizedEmail = email.trim();
  const url = new URL("/api/memberships", HEADLESS_BASE_URL);
  const params = new URLSearchParams();
  params.set("filters[users_permissions_user][email][$eq]", normalizedEmail);
  params.set("pagination[pageSize]", "1");
  params.set("sort[0]", "updatedAt:desc");
  params.set("populate[users_permissions_user]", "*");
  url.search = params.toString();
  return url.toString();
};

export async function fetchLatestMembershipByEmail(email: string): Promise<MembershipEntry | null> {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) {
    return null;
  }
  const requestUrl = buildMembershipStatusUrl(normalizedEmail);
  const response = await safeJsonFetch<StrapiCollectionResponse<MembershipEntry>>(requestUrl);
  const entries = Array.isArray(response?.data) ? response.data : [];
  return entries[0] ?? null;
}

const parseDate = (value: unknown): number | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export function isMembershipActive(entry: MembershipEntry | null | undefined, now = Date.now()): boolean {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  const attrs = entry.attributes ?? (entry as { attributes?: MembershipAttributes }).attributes;
  if (!attrs || typeof attrs !== "object") {
    return false;
  }

  if (typeof attrs.active === "boolean") {
    return attrs.active;
  }

  if (typeof attrs.status === "string") {
    const normalized = attrs.status.trim().toLowerCase();
    if (normalized === "active" || normalized === "current") {
      return true;
    }
    if (normalized === "expired" || normalized === "cancelled" || normalized === "canceled") {
      return false;
    }
  }

  const dateCandidates = [attrs.expiresAt, attrs.endsAt, attrs.endDate];
  for (const candidate of dateCandidates) {
    const timestamp = parseDate(candidate);
    if (timestamp != null) {
      return timestamp > now;
    }
  }

  return false;
}
