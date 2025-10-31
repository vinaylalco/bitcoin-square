import axios from "axios";
import apiClient, { ApiConfigError, assertApiBaseUrl } from "./client";

export type MembershipType = "annual" | "lifetime";

export interface CreatePaymentSessionPayload {
  amount: number;
  membershipType: MembershipType;
  userEmail: string;
}

export interface CreatePaymentSessionResponse {
  paymentUrl: string;
  paymentId: string;
}

export interface MembershipStatus {
  isActive: boolean;
  membershipType: string | null;
  activatedAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  paymentId: string | null;
}

type MembershipEntity = {
  id: number;
  attributes?: {
    membershipType?: string | null;
    status?: string | null;
    state?: string | null;
    isActive?: boolean | null;
    active?: boolean | null;
    activatedAt?: string | null;
    updatedAt?: string | null;
    expiresAt?: string | null;
    paymentId?: string | null;
  } | null;
};

interface StrapiCollectionResponse<T> {
  data: T;
  meta?: unknown;
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return ["true", "1", "yes", "active"].includes(normalized);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return false;
    return value !== 0;
  }

  return false;
}

function resolveIsActive(attributes: MembershipEntity["attributes"]): boolean {
  if (!attributes) {
    return false;
  }

  if (typeof attributes.isActive === "boolean") {
    return attributes.isActive;
  }

  if (typeof attributes.active === "boolean") {
    return attributes.active;
  }

  if (typeof attributes.status === "string") {
    const normalized = attributes.status.trim().toLowerCase();
    if (normalized === "active" || normalized === "activated") {
      return true;
    }
    if (normalized === "inactive" || normalized === "pending") {
      return false;
    }
  }

  if (typeof attributes.state === "string") {
    const normalized = attributes.state.trim().toLowerCase();
    if (normalized === "active" || normalized === "activated") {
      return true;
    }
    if (normalized === "inactive" || normalized === "pending") {
      return false;
    }
  }

  return normalizeBoolean(attributes.status);
}

function safeString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

export async function createPaymentSession(
  payload: CreatePaymentSessionPayload,
): Promise<CreatePaymentSessionResponse> {
  if (!payload.userEmail || !payload.userEmail.includes("@")) {
    throw new Error("A valid email address is required to start the checkout.");
  }

  if (!payload.membershipType) {
    throw new Error("A membership plan must be selected before continuing.");
  }

  if (typeof payload.amount !== "number" || !Number.isFinite(payload.amount)) {
    throw new Error("Membership pricing could not be determined.");
  }

  assertApiBaseUrl();

  try {
    const response = await apiClient.post<CreatePaymentSessionResponse>(
      "/payments/create-session",
      payload,
    );

    const data = response.data;

    if (!data?.paymentUrl) {
      throw new Error("Strapi did not return a payment URL.");
    }

    return data;
  } catch (error) {
    if (error instanceof ApiConfigError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      const message =
        typeof error.response?.data === "object" && error.response?.data !== null
          ? (error.response.data as { error?: { message?: string } })?.error?.message
          : undefined;
      throw new Error(message || error.message || "Unable to start the checkout session.");
    }

    if (error instanceof Error) {
      throw new Error(error.message || "Unable to start the checkout session.");
    }

    throw new Error("Unable to start the checkout session.");
  }
}

export async function fetchMembershipStatusByEmail(
  email: string,
): Promise<MembershipStatus | null> {
  const trimmed = email.trim();
  if (!trimmed) {
    throw new Error("Email is required to check membership status.");
  }

  assertApiBaseUrl();

  const response = await apiClient.get<StrapiCollectionResponse<MembershipEntity[]>>(
    "/memberships",
    {
      params: {
        "filters[user][email][$eq]": trimmed,
        "pagination[pageSize]": 1,
        "sort[0]": "updatedAt:desc",
      },
    },
  );

  const collection = response.data;
  const record = Array.isArray(collection?.data) ? collection.data[0] : undefined;

  if (!record?.attributes) {
    return null;
  }

  const { attributes } = record;

  return {
    isActive: resolveIsActive(attributes),
    membershipType: safeString(attributes.membershipType),
    activatedAt: safeString(attributes.activatedAt),
    updatedAt: safeString(attributes.updatedAt),
    expiresAt: safeString(attributes.expiresAt),
    paymentId: safeString(attributes.paymentId),
  };
}
