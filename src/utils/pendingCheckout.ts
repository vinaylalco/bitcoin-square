const STORAGE_KEY = "bitcoin-square:pending-checkout-url";

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function savePendingCheckout(url: string) {
  if (!canUseSessionStorage() || !url) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, url);
  } catch {
    // ignore storage errors (e.g., private mode)
  }
}

export function getPendingCheckout(): string {
  if (!canUseSessionStorage()) return "";
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function clearPendingCheckout() {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
