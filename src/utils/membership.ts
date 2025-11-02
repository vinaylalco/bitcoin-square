export type MembershipType = "annual" | "lifetime";

export interface MembershipStatus {
  status: string | null;
  type: string | null;
  expiresAt: Date | null;
  isActive: boolean;
}

export interface MembershipCheckoutSnapshot {
  plan: MembershipType;
  timestamp: number;
}

const MEMBERSHIP_CHECKOUT_STORAGE_KEY =
  "bitcoin-square-membership-checkout";

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch (error) {
    console.warn("Unable to access sessionStorage", error);
    return null;
  }
}

export function rememberMembershipCheckoutPlan(plan: MembershipType): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  try {
    const payload: MembershipCheckoutSnapshot = {
      plan,
      timestamp: Date.now(),
    };
    storage.setItem(
      MEMBERSHIP_CHECKOUT_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch (error) {
    console.warn("Failed to store membership checkout plan", error);
  }
}

export function readMembershipCheckoutPlan():
  | MembershipCheckoutSnapshot
  | null {
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(MEMBERSHIP_CHECKOUT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<MembershipCheckoutSnapshot>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (parsed.plan !== "annual" && parsed.plan !== "lifetime") {
      return null;
    }

    const timestamp =
      typeof parsed.timestamp === "number" && Number.isFinite(parsed.timestamp)
        ? parsed.timestamp
        : Date.now();

    return {
      plan: parsed.plan,
      timestamp,
    };
  } catch (error) {
    console.warn("Failed to read membership checkout plan", error);
    return null;
  }
}

export function clearMembershipCheckoutPlan(): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(MEMBERSHIP_CHECKOUT_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear membership checkout plan", error);
  }
}

export function unwrapStrapiEntity(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const unwrapped = unwrapStrapiEntity(item);
      if (unwrapped) {
        return unwrapped;
      }
    }
    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if ("data" in record) {
    return unwrapStrapiEntity(record.data);
  }

  if ("attributes" in record && record.attributes) {
    const attributes = record.attributes;
    if (typeof attributes === "object") {
      const normalized: Record<string, unknown> = {
        ...(attributes as Record<string, unknown>),
      };
      if (record.id !== undefined && normalized.id === undefined) {
        normalized.id = record.id;
      }
      return normalized;
    }
  }

  return record;
}

function normalizeFlag(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value !== 0 : false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return ["true", "1", "yes", "y"].includes(normalized);
  }

  return false;
}

export function extractGrandfatheredFlag(raw: unknown): boolean {
  if (!raw) {
    return false;
  }

  if (Array.isArray(raw)) {
    return raw.some((entry) => extractGrandfatheredFlag(entry));
  }

  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;

    if (record.grandfathered !== undefined) {
      return extractGrandfatheredFlag(record.grandfathered);
    }

    if (record.isGrandfathered !== undefined) {
      return extractGrandfatheredFlag(record.isGrandfathered);
    }

    if (record.data !== undefined) {
      return extractGrandfatheredFlag(record.data);
    }

    if (record.attributes !== undefined) {
      return extractGrandfatheredFlag(record.attributes);
    }

    return false;
  }

  return normalizeFlag(raw);
}

export function normalizeMembershipStatus(raw: unknown): MembershipStatus {
  const entity = unwrapStrapiEntity(raw);

  if (!entity) {
    return {
      status: null,
      type: null,
      expiresAt: null,
      isActive: false,
    };
  }

  const record = entity as Record<string, unknown>;
  const statusValue = record["membership_status"] ?? record["status"];
  const typeValue = record["membership_type"] ?? record["type"];
  const expiresValue =
    record["membership_expires_at"] ?? record["expires_at"];

  const status =
    typeof statusValue === "string" ? statusValue.trim().toLowerCase() : null;
  const type = typeof typeValue === "string" ? typeValue.trim().toLowerCase() : null;

  let expiresAt: Date | null = null;
  if (expiresValue instanceof Date) {
    expiresAt = expiresValue;
  } else if (typeof expiresValue === "string") {
    const parsed = new Date(expiresValue);
    if (!Number.isNaN(parsed.getTime())) {
      expiresAt = parsed;
    }
  }

  const isAnnual = type === "annual";
  let isActive = status === "active";

  if (isActive && isAnnual) {
    if (!expiresAt) {
      isActive = false;
    } else {
      isActive = expiresAt.getTime() > Date.now();
    }
  }

  return {
    status,
    type,
    expiresAt,
    isActive,
  };
}

export function isMembershipActive(raw: unknown): boolean {
  return normalizeMembershipStatus(raw).isActive;
}
