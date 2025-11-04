import type { AuthResponse } from "../api/auth";

const STORAGE_KEY = "bitcoin-square-pending-membership-auth";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(): StorageLike | null {
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

export interface PendingMembershipAuthSnapshot {
  auth: AuthResponse;
  timestamp: number;
}

export function rememberPendingMembershipAuth(auth: AuthResponse): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    const snapshot: PendingMembershipAuthSnapshot = {
      auth,
      timestamp: Date.now(),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("Failed to store pending membership auth", error);
  }
}

export function readPendingMembershipAuth(): PendingMembershipAuthSnapshot | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PendingMembershipAuthSnapshot> | null;
    if (!parsed || typeof parsed !== "object" || !parsed.auth) {
      return null;
    }

    const candidate = parsed.auth as Partial<AuthResponse> | null;
    if (!candidate || typeof candidate !== "object" || typeof candidate.jwt !== "string") {
      return null;
    }

    const userCandidate = candidate.user as AuthResponse["user"] | null;
    if (!userCandidate || typeof userCandidate !== "object") {
      return null;
    }

    return {
      auth: {
        jwt: candidate.jwt,
        user: userCandidate,
      },
      timestamp:
        typeof parsed.timestamp === "number" && Number.isFinite(parsed.timestamp)
          ? parsed.timestamp
          : Date.now(),
    };
  } catch (error) {
    console.warn("Failed to read pending membership auth", error);
    return null;
  }
}

export function clearPendingMembershipAuth(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear pending membership auth", error);
  }
}
