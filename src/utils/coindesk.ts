const COINDESK_API_KEY = import.meta.env.VITE_COINDESK_API_KEY ?? "";
const COINDESK_DATA_API_BASE_URL = "https://data-api.coindesk.com";

type CoinDeskError = {
  Message?: string;
  message?: string;
  Status?: number;
  status?: number;
};

type CoinDeskHistoricalDay = {
  TIME?: number;
  OPEN?: number;
  HIGH?: number;
  LOW?: number;
  CLOSE?: number;
  VOLUME?: number;
};

type CoinDeskHistoricalDaysResponse = {
  Data?: CoinDeskHistoricalDay[] | { Data?: CoinDeskHistoricalDay[] };
  Err?: CoinDeskError | null;
};

type CoinDeskLatestTickInstrument = {
  PRICE?: number;
  INSTRUMENT?: string;
};

type CoinDeskLatestTickResponse = {
  Data?:
    | Record<string, CoinDeskLatestTickInstrument>
    | Array<CoinDeskLatestTickInstrument>;
  Err?: CoinDeskError | null;
};

type DataApiRequestOptions = {
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestCoinDeskDataApi<T>({ path, query = {} }: DataApiRequestOptions): Promise<T> {
  const url = new URL(path, COINDESK_DATA_API_BASE_URL);
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined) return;
    url.searchParams.set(key, String(value));
  });
  if (COINDESK_API_KEY) {
    url.searchParams.set("api_key", COINDESK_API_KEY);
  }

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(url.toString());
    if (response.ok) {
      return (await response.json()) as T;
    }

    const shouldRetry = response.status === 429 || response.status >= 500;
    if (!shouldRetry || attempt === maxRetries) {
      throw new Error(`CoinDesk data API failed (${response.status}).`);
    }

    await sleep(200 * (attempt + 1));
  }

  throw new Error("CoinDesk data API failed (unexpected).");
}

export async function fetchBtcDailyHistory({
  limit = 30,
  toTs,
}: {
  limit?: number;
  toTs?: number;
}): Promise<CoinDeskHistoricalDaysResponse> {
  return requestCoinDeskDataApi<CoinDeskHistoricalDaysResponse>({
    path: "/index/cc/v1/historical/days",
    query: {
      market: "cadli",
      instrument: "BTC-USD",
      limit,
      aggregate: 1,
      fill: true,
      apply_mapping: true,
      response_format: "JSON",
      to_ts: toTs,
    },
  });
}

export async function fetchLatestTick(): Promise<CoinDeskLatestTickResponse> {
  return requestCoinDeskDataApi<CoinDeskLatestTickResponse>({
    path: "/index/cc/v1/latest/tick",
    query: {
      market: "cadli",
      instruments: "BTC-USD,ETH-USD",
      apply_mapping: true,
    },
  });
}
