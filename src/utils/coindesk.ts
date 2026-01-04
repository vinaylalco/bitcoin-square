const COINDESK_API_KEY = import.meta.env.VITE_COINDESK_API_KEY ?? "";
const COINDESK_HISTORICAL_URL = "https://api.coindesk.com/v1/bpi/historical/close.json";
const COINDESK_LATEST_TICK_URL =
  "https://data-api.coindesk.com/spot/v1/latest/tick";

type CoinDeskHistoricalResponse = { bpi?: Record<string, number> };

type CoinDeskLatestTickResponse = {
  Data?: Record<
    string,
    {
      PRICE?: number;
    }
  >;
};

function appendApiKey(url: URL) {
  if (COINDESK_API_KEY) {
    url.searchParams.set("api_key", COINDESK_API_KEY);
  }
}

export async function fetchCoinDeskHistoricalClose(
  start: string,
  end: string,
): Promise<CoinDeskHistoricalResponse> {
  const url = new URL(COINDESK_HISTORICAL_URL);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);
  appendApiKey(url);
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`CoinDesk historical data failed (${response.status}).`);
  }
  return (await response.json()) as CoinDeskHistoricalResponse;
}

export async function fetchCoinDeskLatestTick(): Promise<CoinDeskLatestTickResponse> {
  const url = new URL(COINDESK_LATEST_TICK_URL);
  url.searchParams.set("market", "coinbase");
  url.searchParams.set("instruments", "BTC-USD");
  url.searchParams.set("apply_mapping", "true");
  appendApiKey(url);
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`CoinDesk latest tick failed (${response.status}).`);
  }
  return (await response.json()) as CoinDeskLatestTickResponse;
}
