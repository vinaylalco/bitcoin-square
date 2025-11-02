export interface MembershipStatus {
  status: string | null;
  type: string | null;
  expiresAt: Date | null;
  isActive: boolean;
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
