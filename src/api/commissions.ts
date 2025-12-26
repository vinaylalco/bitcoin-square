import {
  StrapiConfigError,
  StrapiNetworkError,
  StrapiRequestError,
  getStrapiBaseUrl,
} from "./strapi-client";

export interface CommissionAttributes {
  orderId?: string | null;
  type?: string | null;
  amountBtc?: number | string | null;
  status?: string | null;
  createdAt?: string | null;
  referrerId?: number | string | null;
}

export interface Commission {
  id: number;
  orderId?: string | null;
  type?: string | null;
  amountBtc?: number;
  status?: string | null;
  createdAt?: string | null;
  referrerId?: number | string | null;
}

interface StrapiCommissionEntity {
  id: number;
  attributes?: CommissionAttributes | null;
}

interface CommissionListResponse {
  data?: StrapiCommissionEntity[];
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

function normalizeCommission(entry: StrapiCommissionEntity): Commission {
  const attributes = entry.attributes ?? {};
  return {
    id: entry.id,
    orderId: attributes.orderId ?? null,
    type: attributes.type ?? null,
    amountBtc: normalizeAmount(attributes.amountBtc),
    status: attributes.status ?? null,
    createdAt: attributes.createdAt ?? null,
    referrerId: attributes.referrerId ?? null,
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

async function fetchCommissionList(path: string): Promise<CommissionListResponse> {
  const base = getStrapiBaseUrl();
  if (!base) {
    throw new StrapiConfigError();
  }

  const jwt = getStoredJwt();
  if (!jwt) {
    console.warn("Missing Strapi JWT for commissions request.");
    return { data: [] };
  }

  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
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

  return (response.data ?? []).map(normalizeCommission);
}

export async function fetchAllCommissions(): Promise<Commission[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("pagination[pageSize]", "200");
  searchParams.set("sort[0]", "createdAt:desc");

  const response = await fetchCommissionList(
    `/api/commissions?${searchParams.toString()}`,
  );

  return (response.data ?? []).map(normalizeCommission);
}
