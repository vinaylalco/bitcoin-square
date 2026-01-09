import {
  StrapiConfigError,
  StrapiNetworkError,
  StrapiRequestError,
  getStrapiBaseUrl,
} from "./strapi-client";

export interface CommissionAttributes {
  orderId?: string | null;
  type?: string | null;
  /** @deprecated legacy field removed from Strapi schema */
  amountBtc?: number | string | null;
  commissionStatus?: string | null;
  createdAt?: string | null;
  referrerId?: number | string | null;
  paidAmount?: number | string | null;
  paidCurrency?: string | null;
  commissionRate?: number | string | null;
  commissionAmount?: number | string | null;
  commissionCurrency?: string | null;
  commissionLevel?: number | string | null;
  commissionTierAtCreation?: string | null;
}

export interface Commission {
  id: number;
  orderId?: string | null;
  type?: string | null;
  /** @deprecated legacy field removed from Strapi schema */
  amountBtc?: number | null;
  commissionStatus?: string | null;
  createdAt?: string | null;
  referrerId?: number | string | null;
  paidAmount?: number | null;
  paidCurrency?: string | null;
  commissionRate?: number | null;
  commissionAmount?: number | null;
  commissionCurrency?: string | null;
  commissionLevel?: number | null;
  commissionTierAtCreation?: string | null;
}

type StrapiCommissionEntity = CommissionAttributes & {
  id: number;
  attributes?: CommissionAttributes | null;
};

interface CommissionListResponse {
  data?: StrapiCommissionEntity[];
}

const COMMISSION_PUBLICATION_STATUSES = new Set(["draft", "published"]);

function shouldRenameWorkflowStatus(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && !COMMISSION_PUBLICATION_STATUSES.has(normalized);
}

function getRenamedStatusKey(key: string): string | null {
  if (key === "status" || key.startsWith("status[")) {
    return key.replace(/^status/, "commissionStatus");
  }
  if (key.startsWith("filters[status]")) {
    return key.replace("filters[status]", "filters[commissionStatus]");
  }
  if (key.startsWith("filters.status")) {
    return key.replace("filters.status", "filters.commissionStatus");
  }
  return null;
}

function renameCommissionSearchParams(searchParams: URLSearchParams): void {
  const entries = Array.from(searchParams.entries());
  entries.forEach(([key, value]) => {
    const renamedKey = getRenamedStatusKey(key);
    if (!renamedKey) {
      return;
    }
    if (!shouldRenameWorkflowStatus(value)) {
      return;
    }
    searchParams.delete(key);
    searchParams.append(renamedKey, value);
  });
}

function isCommissionEndpoint(url: URL): boolean {
  return url.pathname.includes("/commissions") || url.pathname.includes("commission");
}

function normalizeCommissionRequest(
  url: URL,
  init?: RequestInit,
): { url: URL; init?: RequestInit } {
  if (!isCommissionEndpoint(url)) {
    return { url, init };
  }

  renameCommissionSearchParams(url.searchParams);

  if (init?.body && typeof init.body === "string") {
    try {
      const parsed = JSON.parse(init.body) as {
        status?: unknown;
        commissionStatus?: unknown;
      };
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed.status !== undefined &&
        parsed.commissionStatus === undefined &&
        shouldRenameWorkflowStatus(String(parsed.status))
      ) {
        const { status, ...rest } = parsed;
        const normalizedBody = JSON.stringify({
          ...rest,
          commissionStatus: status,
        });
        return { url, init: { ...init, body: normalizedBody } };
      }
    } catch {
      return { url, init };
    }
  }

  return { url, init };
}

function normalizeAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeCommission(entry: StrapiCommissionEntity): Commission {
  const attributes = entry.attributes ?? entry;
  const legacyStatus = (attributes as { status?: string | null }).status ?? null;
  const legacyAmount = normalizeOptionalNumber(attributes.amountBtc);
  const commissionAmount =
    normalizeOptionalNumber(attributes.commissionAmount) ?? legacyAmount;
  return {
    id: entry.id,
    orderId: attributes.orderId ?? null,
    type: attributes.type ?? null,
    amountBtc: legacyAmount,
    commissionAmount,
    commissionStatus: attributes.commissionStatus ?? legacyStatus,
    createdAt: attributes.createdAt ?? null,
    referrerId: attributes.referrerId ?? null,
    paidAmount: normalizeOptionalNumber(attributes.paidAmount),
    paidCurrency: attributes.paidCurrency ?? null,
    commissionRate: normalizeOptionalNumber(attributes.commissionRate),
    commissionCurrency: attributes.commissionCurrency ?? null,
    commissionLevel: normalizeOptionalNumber(attributes.commissionLevel),
    commissionTierAtCreation: attributes.commissionTierAtCreation ?? null,
  };
}

function getStoredJwt(): string | null {
  const session =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("strapi_jwt") ||
        sessionStorage.getItem("jwt") ||
        sessionStorage.getItem("token") ||
        sessionStorage.getItem("accessToken")
      : null;
  if (session) return session;

  const local =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("strapi_jwt") ||
        localStorage.getItem("jwt") ||
        localStorage.getItem("token") ||
        localStorage.getItem("accessToken")
      : null;

  return local;
}

function getCommissionAuthHeaders(): HeadersInit | null {
  const jwt = getStoredJwt();
  if (!jwt) {
    console.warn("Missing Strapi JWT for commissions request.");
    return null;
  }
  return {
    Authorization: `Bearer ${jwt}`,
  };
}

async function fetchCommissionList(path: string): Promise<CommissionListResponse> {
  const base = getStrapiBaseUrl();
  if (!base) {
    throw new StrapiConfigError();
  }

  const headers = getCommissionAuthHeaders();
  if (!headers) {
    return { data: [] };
  }

  const url = path.startsWith("http")
    ? new URL(path)
    : new URL(path.startsWith("/") ? path : `/${path}`, base);
  const normalized = normalizeCommissionRequest(url);

  let response: Response;
  try {
    response = await fetch(normalized.url.toString(), {
      headers,
      ...normalized.init,
    });
  } catch (error) {
    throw new StrapiNetworkError(
      error instanceof Error ? error.message : "Unknown Strapi fetch error",
    );
  }

  if (!response.ok) {
    let payload: unknown;
    let message = `Strapi request failed with status ${response.status}`;

    try {
      payload = await response.json();
      const extractedMessage =
        typeof payload === "string"
          ? payload
          : (payload as { error?: { message?: string }; message?: string })?.error
              ?.message ??
            (payload as { error?: { message?: string }; message?: string })?.message;
      if (
        extractedMessage &&
        typeof extractedMessage === "string" &&
        extractedMessage.trim()
      ) {
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

  return response.json() as Promise<CommissionListResponse>;
}

export async function exportCommissionReport(params: {
  commissionStatus?: string;
  status?: string;
  format: string;
}): Promise<Response> {
  const base = getStrapiBaseUrl();
  if (!base) {
    throw new StrapiConfigError();
  }

  const headers = getCommissionAuthHeaders();
  if (!headers) {
    return new Response(null, { status: 401 });
  }

  const exportUrl = new URL("/api/commissions/export", base);
  const statusValue = params.commissionStatus ?? params.status;
  if (statusValue) {
    if (shouldRenameWorkflowStatus(statusValue)) {
      exportUrl.searchParams.set("commissionStatus", statusValue);
    } else {
      exportUrl.searchParams.set("status", statusValue);
    }
  }
  exportUrl.searchParams.set("format", params.format);
  const normalized = normalizeCommissionRequest(exportUrl);

  try {
    return await fetch(normalized.url.toString(), {
      headers,
    });
  } catch (error) {
    throw new StrapiNetworkError(
      error instanceof Error ? error.message : "Unknown Strapi fetch error",
    );
  }
}

export async function fetchCommissionsByReferrer(
  referrerId: number | string,
): Promise<Commission[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("filters[referrerId][$eq]", String(referrerId));
  searchParams.set("pagination[pageSize]", "100");
  searchParams.set("sort[0]", "createdAt:desc");

  const response = await fetchCommissionList(
    `/api/commissions?${searchParams.toString()}`,
  );

  const entries = Array.isArray(response.data) ? response.data : [];
  return entries.map(normalizeCommission);
}

export async function fetchMyCommissions(): Promise<Commission[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("pagination[pageSize]", "100");
  searchParams.set("sort[0]", "createdAt:desc");

  const response = await fetchCommissionList(
    `/api/commissions/me?${searchParams.toString()}`,
  );

  const entries = Array.isArray(response.data) ? response.data : [];
  return entries.map(normalizeCommission);
}

export async function fetchAllCommissions(): Promise<Commission[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("pagination[pageSize]", "200");
  searchParams.set("sort[0]", "createdAt:desc");

  const response = await fetchCommissionList(
    `/api/commissions?${searchParams.toString()}`,
  );

  const entries = Array.isArray(response.data) ? response.data : [];
  return entries.map(normalizeCommission);
}
