const STABLECOINS = new Set(["USDT", "USDC", "DAI", "BUSD", "TUSD", "USDP"]);

function resolveFractionDigits(currency?: string | null): number {
  const normalized = currency?.trim().toUpperCase();

  if (!normalized) {
    return 2;
  }

  if (normalized === "BTC") {
    return 8;
  }

  if (STABLECOINS.has(normalized)) {
    return 6;
  }

  return 6;
}

export function formatCurrencyAmount(amount?: number | null, currency?: string | null): string {
  if (amount == null || Number.isNaN(amount)) {
    return "--";
  }

  const maximumFractionDigits = resolveFractionDigits(currency);
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });

  const suffix = currency?.trim();
  return suffix ? `${formatted} ${suffix}` : formatted;
}
