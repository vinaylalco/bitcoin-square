import type { Product } from "../types/product";

function toNormalizedString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  if (value == null) {
    return "";
  }
  return String(value).trim().toLowerCase();
}

export function isComplimentaryProduct(product: Product): boolean {
  const normalizedStatus = toNormalizedString(
    product.PaymentStatus ?? (product as Record<string, unknown>).paymentStatus ?? product.Price,
  );

  return (
    normalizedStatus === "not paid" ||
    normalizedStatus === "free" ||
    normalizedStatus === "complimentary" ||
    normalizedStatus === "no cost"
  );
}

export function formatProductPrice(product: Product): string {
  const rawPrice =
    typeof product.Price === "string"
      ? product.Price.trim()
      : product.Price != null
      ? String(product.Price).trim()
      : "";

  if (isComplimentaryProduct(product)) {
    if (rawPrice && toNormalizedString(rawPrice) !== "not paid") {
      return rawPrice;
    }
    return "Free";
  }

  if (!rawPrice) {
    return "";
  }

  return rawPrice.startsWith("$") || rawPrice.toLowerCase().startsWith("usd")
    ? rawPrice
    : `$${rawPrice}`;
}
