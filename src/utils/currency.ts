export function formatCurrency(
  amount?: number | string | null,
  currency = "USD",
  locale = "en-US",
): string {
  if (amount === null || amount === undefined) {
    return "";
  }

  const numericValue = typeof amount === "string" ? Number(amount) : amount;
  if (numericValue === undefined || Number.isNaN(numericValue)) {
    return "";
  }

  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });

  return formatter.format(numericValue);
}
