export interface Quote {
  providerId: string;
  providerName: string;
  estimatedBtc: number;
  feeText?: string;
  kycRequired?: boolean;
  privacyScore?: number;
}

export async function getUsdtToBtcQuotes({
  amountUsdt,
  preferPrivacy,
}: {
  amountUsdt: number;
  preferPrivacy: boolean;
}): Promise<Quote[]> {
  try {
    if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
      return [];
    }

    const mockQuotes: Quote[] = [
      {
        providerId: "trocador-mock-fast",
        providerName: "MockExchange Fast",
        estimatedBtc: amountUsdt / 68000,
        feeText: "0.7% estimated fees",
        kycRequired: true,
        privacyScore: 42,
      },
      {
        providerId: "trocador-mock-private",
        providerName: "MockExchange Private",
        estimatedBtc: amountUsdt / 69000,
        feeText: "1.1% estimated fees",
        kycRequired: false,
        privacyScore: 88,
      },
      {
        providerId: "trocador-mock-balanced",
        providerName: "MockExchange Balanced",
        estimatedBtc: amountUsdt / 68500,
        feeText: "0.9% estimated fees",
        kycRequired: false,
        privacyScore: 65,
      },
    ];

    const quotes = Array.isArray(mockQuotes) ? mockQuotes : [];
    if (preferPrivacy) {
      return quotes.map((quote) => ({ ...quote }));
    }
    return quotes.map((quote) => ({ ...quote }));
  } catch (error) {
    console.warn("Failed to load Trocador quotes (stub). TODO: must proxy via backend.", error);
    return [];
  }
}
