import { strapiFetch } from "./strapi-client";

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

export async function fetchCommissionsByReferrer(
  referrerId: number | string,
): Promise<Commission[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("filters[referrerId][$eq]", String(referrerId));
  searchParams.set("pagination[pageSize]", "100");
  searchParams.set("sort[0]", "createdAt:desc");

  const response = await strapiFetch<CommissionListResponse>(
    `/api/commissions?${searchParams.toString()}`,
  );

  return (response.data ?? []).map(normalizeCommission);
}

export async function fetchAllCommissions(): Promise<Commission[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("pagination[pageSize]", "200");
  searchParams.set("sort[0]", "createdAt:desc");

  const response = await strapiFetch<CommissionListResponse>(
    `/api/commissions?${searchParams.toString()}`,
  );

  return (response.data ?? []).map(normalizeCommission);
}
