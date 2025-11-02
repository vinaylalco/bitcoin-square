export const MEMBERSHIP_EMAIL_STORAGE_KEY = "bitcoin-square.membershipEmail";
export const MEMBERSHIP_PAYMENT_STORAGE_KEY = "bitcoin-square.membershipPayment";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readMembershipEmail(): string {
  if (!isBrowser()) return "";
  const value = window.localStorage.getItem(MEMBERSHIP_EMAIL_STORAGE_KEY);
  return value ? value.trim() : "";
}

export function storeMembershipEmail(email: string) {
  if (!isBrowser()) return;
  const trimmed = email.trim();
  if (!trimmed) {
    window.localStorage.removeItem(MEMBERSHIP_EMAIL_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(MEMBERSHIP_EMAIL_STORAGE_KEY, trimmed);
}

export function clearMembershipEmail() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(MEMBERSHIP_EMAIL_STORAGE_KEY);
}

export function readMembershipPaymentId(): string {
  if (!isBrowser()) return "";
  const value = window.localStorage.getItem(MEMBERSHIP_PAYMENT_STORAGE_KEY);
  return value ? value.trim() : "";
}

export function storeMembershipPaymentId(paymentId: string) {
  if (!isBrowser()) return;
  const trimmed = paymentId.trim();
  if (!trimmed) {
    window.localStorage.removeItem(MEMBERSHIP_PAYMENT_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(MEMBERSHIP_PAYMENT_STORAGE_KEY, trimmed);
}

export function clearMembershipPaymentId() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(MEMBERSHIP_PAYMENT_STORAGE_KEY);
}
