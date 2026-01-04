import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchBtcDailyHistory } from "../utils/coindesk";

const HISTORICAL_CACHE_KEY = "btc-buying-strategies-historical-cache";
const SETTINGS_CACHE_KEY = "btc-buying-strategies-settings";

type HistoricalRow = {
  dateStr: string;
  date: Date;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Schedule = "daily" | "weekly" | "biweekly" | "monthly";

type BacktestPoint = {
  dateStr: string;
  date: Date;
  price: number;
  depositUSD: number;
  buyUSD: number;
  feeUSD: number;
  cashUSD: number;
  contributedToDate: number;
  btc: number;
  valueUSD: number;
  roi: number | null;
};

type BacktestResult = {
  history: BacktestPoint[];
  totalContributedUSD: number;
  totalFeesUSD: number;
  btc: number;
  finalValueUSD: number;
  roi: number | null;
  xirr: number | null;
  maxDrawdown: number | null;
};

type HistoricalCache = {
  limit: number;
  rows: {
    dateStr: string;
    price: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[];
  savedAt: number;
};

type SettingsCache = {
  schedule: Schedule;
  amountPerPeriod: number;
  feeRate: number;
};

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `$${value.toLocaleString()}`;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatPercent(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function formatDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseHistoricalRows(
  payload?: {
    Data?:
      | Array<{
          TIME?: number;
          TIMESTAMP?: number;
          OPEN?: number;
          HIGH?: number;
          LOW?: number;
          CLOSE?: number;
          VOLUME?: number;
        }>
      | {
          Data?: Array<{
            TIME?: number;
            TIMESTAMP?: number;
            OPEN?: number;
            HIGH?: number;
            LOW?: number;
            CLOSE?: number;
            VOLUME?: number;
          }>;
        };
  } | null,
): HistoricalRow[] {
  const rawData = Array.isArray(payload?.Data)
    ? payload?.Data ?? []
    : Array.isArray(payload?.Data?.Data)
      ? payload?.Data?.Data ?? []
      : [];
  return rawData
    .map((row) => {
      const timestamp = row?.TIME ?? row?.TIMESTAMP;
      if (timestamp == null || typeof row.CLOSE !== "number") {
        return null;
      }
      const date = new Date(timestamp * 1000);
      if (Number.isNaN(date.getTime())) {
        return null;
      }
      const dateStr = date.toISOString().slice(0, 10);
      const open = typeof row.OPEN === "number" ? row.OPEN : row.CLOSE;
      const high = typeof row.HIGH === "number" ? row.HIGH : row.CLOSE;
      const low = typeof row.LOW === "number" ? row.LOW : row.CLOSE;
      const close = row.CLOSE;
      const volume = typeof row.VOLUME === "number" ? row.VOLUME : 0;
      return {
        dateStr,
        date,
        price: close,
        open,
        high,
        low,
        close,
        volume,
      };
    })
    .filter((row): row is HistoricalRow => row !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function loadCachedHistorical(limit: number): HistoricalRow[] | null {
  try {
    const raw = localStorage.getItem(HISTORICAL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HistoricalCache;
    if (parsed.limit !== limit || !Array.isArray(parsed.rows)) {
      return null;
    }
    return parsed.rows.map((row) => ({
      dateStr: row.dateStr,
      date: new Date(`${row.dateStr}T00:00:00Z`),
      price: row.price,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    }));
  } catch {
    return null;
  }
}

function saveCachedHistorical(limit: number, rows: HistoricalRow[]) {
  const payload: HistoricalCache = {
    limit,
    rows: rows.map((row) => ({
      dateStr: row.dateStr,
      price: row.price,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    })),
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(HISTORICAL_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore cache write failures.
  }
}

function calculateMaxDrawdown(values?: number[] | null): number | null {
  const safeValues = Array.isArray(values) ? values : [];
  if (!safeValues.length) return null;
  let peak = safeValues[0];
  let maxDrawdown = 0;
  safeValues.forEach((value) => {
    if (value > peak) {
      peak = value;
    }
    const drawdown = peak > 0 ? (value - peak) / peak : 0;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  });
  return maxDrawdown;
}

function calculateXirr(
  cashflows?: Array<{ date: Date; amount: number }> | null,
  maxIterations = 50,
): number | null {
  const safeCashflows = Array.isArray(cashflows) ? cashflows : [];
  if (safeCashflows.length < 2) return null;
  const hasPositive = safeCashflows.some((flow) => flow.amount > 0);
  const hasNegative = safeCashflows.some((flow) => flow.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const baseDate = safeCashflows[0].date;
  const times = safeCashflows.map((flow) => ({
    amount: flow.amount,
    years: (flow.date.getTime() - baseDate.getTime()) / (365 * 24 * 60 * 60 * 1000),
  }));

  let rate = 0.1;
  for (let i = 0; i < maxIterations; i += 1) {
    let npv = 0;
    let derivative = 0;
    times.forEach((flow) => {
      const denom = (1 + rate) ** flow.years;
      npv += flow.amount / denom;
      derivative += (-flow.years * flow.amount) / (denom * (1 + rate));
    });
    if (Math.abs(npv) < 1e-7) {
      return rate;
    }
    if (derivative === 0) {
      return null;
    }
    const nextRate = rate - npv / derivative;
    if (!Number.isFinite(nextRate)) {
      return null;
    }
    if (Math.abs(nextRate - rate) < 1e-7) {
      return nextRate;
    }
    rate = nextRate;
  }
  return null;
}

function pickSchedulePoints(rows: HistoricalRow[], frequency: Schedule): HistoricalRow[] {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());

  if (frequency === "daily") {
    return sorted;
  }

  if (frequency === "weekly") {
    return sorted.filter((_, index) => index % 7 === 0);
  }

  if (frequency === "biweekly") {
    return sorted.filter((_, index) => index % 14 === 0);
  }

  const monthlyMap = new Map<string, HistoricalRow>();
  sorted.forEach((row) => {
    const key = `${row.date.getUTCFullYear()}-${String(row.date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, row);
    }
  });

  return Array.from(monthlyMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

export default function BtcBuyingStrategiesPage() {
  const today = useMemo(() => new Date(), []);
  const defaultEnd = formatDateInput(today);

  const historyLimit = 30;
  const [rows, setRows] = useState<HistoricalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Schedule>("weekly");
  const [amountPerPeriod, setAmountPerPeriod] = useState(100);
  const [feeRate, setFeeRate] = useState(0.25);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [exchangeName, setExchangeName] = useState("");
  const [exchangeStartDate, setExchangeStartDate] = useState(formatDateInput(today));
  const [exchangeFrequency, setExchangeFrequency] = useState<Schedule>("weekly");
  const [exchangeAmount, setExchangeAmount] = useState(100);
  const [exchangeNote, setExchangeNote] = useState("");

  useEffect(() => {
    const title = "BTC Buying Strategies | Bitcoin Square";
    const description =
      "Backtest a simple Bitcoin dollar-cost averaging plan with no selling.";
    document.title = title;
    const ensureMeta = (name: string, content: string, attr: "name" | "property" = "name") => {
      const selector = `meta[${attr}="${name}"]`;
      let tag = document.querySelector<HTMLMetaElement>(selector);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attr, name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };
    ensureMeta("description", description);
    ensureMeta("og:title", title, "property");
    ensureMeta("og:description", description, "property");
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SettingsCache>;
      if (parsed.schedule) setSchedule(parsed.schedule);
      if (parsed.amountPerPeriod != null) setAmountPerPeriod(parsed.amountPerPeriod);
      if (parsed.feeRate != null) setFeeRate(parsed.feeRate);
    } catch {
      // Ignore settings hydration failures.
    }
  }, []);

  useEffect(() => {
    const payload: SettingsCache = {
      schedule,
      amountPerPeriod,
      feeRate,
    };
    try {
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore settings persistence failures.
    }
  }, [schedule, amountPerPeriod, feeRate]);

  const handleNumberChange =
    (setter: (value: number) => void) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      if (Number.isFinite(next)) {
        setter(next);
      }
    };

  const fetchHistorical = async () => {
    setError(null);
    setLoading(true);
    const cached = loadCachedHistorical(historyLimit);
    if (Array.isArray(cached) && cached.length > 0) {
      setRows(cached);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchBtcDailyHistory({ limit: historyLimit });
      if (!data) {
        throw new Error("CoinDesk returned an empty response.");
      }
      const err = data.Err ?? null;
      const hasErrorDetails =
        err != null &&
        (typeof err.message === "string" ||
          typeof err.Message === "string" ||
          typeof err.status === "number" ||
          typeof err.Status === "number");
      if (hasErrorDetails) {
        const message = err.message ?? err.Message ?? "CoinDesk returned an error.";
        const status = err.status ?? err.Status;
        throw new Error(status ? `${message} (${status})` : message);
      }
      const parsed = parseHistoricalRows(data ?? {});
      setRows(parsed);
      saveCachedHistorical(historyLimit, parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load historical prices.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHistorical();
  }, []);

  const safeRows = Array.isArray(rows) ? rows : [];
  const backtestHistory = Array.isArray(backtest?.history) ? backtest?.history : [];
  const lastBacktestPoint = backtestHistory.at(-1);
  const startDate = safeRows.length ? safeRows[0].dateStr : defaultEnd;
  const endDate = safeRows.length ? safeRows[safeRows.length - 1].dateStr : defaultEnd;

  const runBacktest = () => {
    if (!safeRows.length) {
      setError("Load price history before running the backtest.");
      return;
    }

    const scheduledRows = pickSchedulePoints(safeRows, schedule);
    const scheduledDates = new Set(scheduledRows.map((row) => row.dateStr));
    let cashUSD = 0;
    let totalContributedUSD = 0;
    let totalFeesUSD = 0;
    let btc = 0;

    const history = safeRows.map((row) => {
      let depositUSD = 0;
      let buyUSD = 0;
      let feeUSD = 0;

      if (scheduledDates.has(row.dateStr)) {
        depositUSD = amountPerPeriod;
        cashUSD += depositUSD;
        totalContributedUSD += depositUSD;

        buyUSD = Math.min(cashUSD, depositUSD);
        feeUSD = buyUSD * (feeRate / 100);
        const netUSD = Math.max(0, buyUSD - feeUSD);
        btc += netUSD / row.price;
        cashUSD -= buyUSD;
        totalFeesUSD += feeUSD;
      }

      const valueUSD = btc * row.price + cashUSD;
      const roi =
        totalContributedUSD > 0 ? (valueUSD - totalContributedUSD) / totalContributedUSD : null;

      return {
        dateStr: row.dateStr,
        date: row.date,
        price: row.price,
        depositUSD,
        buyUSD,
        feeUSD,
        cashUSD,
        contributedToDate: totalContributedUSD,
        btc,
        valueUSD,
        roi,
      };
    });

    const lastPoint = history.at(-1);
    const finalValueUSD = lastPoint ? lastPoint.valueUSD : 0;
    const roi =
      totalContributedUSD > 0
        ? (finalValueUSD - totalContributedUSD) / totalContributedUSD
        : null;
    const cashflows = history
      .filter((point) => point.depositUSD > 0)
      .map((point) => ({ date: point.date, amount: -point.depositUSD }));
    if (lastPoint && finalValueUSD > 0) {
      cashflows.push({ date: lastPoint.date, amount: finalValueUSD });
    }
    const xirr = calculateXirr(cashflows);
    const maxDrawdown = calculateMaxDrawdown(history.map((point) => point.valueUSD));

    setBacktest({
      history,
      totalContributedUSD,
      totalFeesUSD,
      btc,
      finalValueUSD,
      roi,
      xirr,
      maxDrawdown,
    });
  };

  const priceChartData = safeRows.length
    ? safeRows.map((row) => ({
        dateStr: row.dateStr,
        price: row.price,
      }))
    : [];

  const valueChartData = backtestHistory.length
    ? backtestHistory.map((point) => ({
        dateStr: point.dateStr,
        value: point.valueUSD,
      }))
    : [];

  const roiChartData = backtestHistory.length
    ? backtestHistory.map((point) => {
        const roiToDate =
          point.contributedToDate > 0
            ? (point.valueUSD - point.contributedToDate) / point.contributedToDate
            : null;
        return {
          dateStr: point.dateStr,
          roi: roiToDate != null ? roiToDate * 100 : null,
        };
      })
    : [];

  const auditRows = backtestHistory ?? [];

  const handleExportCsv = () => {
    if (!backtest) return;
    const exportHistory = Array.isArray(backtest?.history) ? backtest?.history ?? [] : [];
    const escapeCsv = (value: unknown) => {
      if (value == null) return "";
      const text = String(value);
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };
    const header = [
      "date",
      "price",
      "deposit",
      "buy_usd",
      "fee_usd",
      "cash_usd",
      "btc_total",
      "portfolio_value_usd",
      "contributed_to_date",
      "roi",
    ];
    const rowsCsv = exportHistory.map((point) => [
      point.dateStr,
      point.price,
      point.depositUSD,
      point.buyUSD,
      point.feeUSD,
      point.cashUSD,
      point.btc,
      point.valueUSD,
      point.contributedToDate,
      point.roi,
    ]);
    const csvContent =
      [header, ...rowsCsv].map((row) => row.map(escapeCsv).join(",")).join("\n") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `normal-dca-backtest-${startDate}-${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (error && !loading && !safeRows.length) {
    return (
      <div className="bg-[var(--bg-app)] text-[var(--fg-default)]">
        <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-12 text-center sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
            BTC Buying Strategies
          </p>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            We hit an issue loading data.
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{error}</p>
          <button
            type="button"
            onClick={() => fetchHistorical()}
            className="mx-auto rounded-full border border-transparent bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-white shadow-sm transition hover:bg-brand/90"
          >
            Retry loading data
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-app)] text-[var(--fg-default)]">
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
            BTC Buying Strategies
          </p>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            Normal BTC DCA (No Selling)
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Backtest a clean dollar-cost averaging plan with fixed buys and zero selling.
          </p>
        </header>

        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                BTC price history
              </p>
              <h2 className="mt-2 text-lg font-semibold text-neutral-900 dark:text-white">
                Historical BTC Close (USD)
              </h2>
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {safeRows.length ? `${safeRows.length} data points` : "No data yet"}
            </div>
          </div>
          <div className="mt-6 h-80">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                Loading historical prices...
              </div>
            ) : safeRows.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="dateStr" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `$${Number(value).toLocaleString()}`}
                    width={80}
                  />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} labelClassName="text-xs" />
                  <Line type="monotone" dataKey="price" stroke="#F97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                Select a date range and fetch data to view the chart.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">DCA Inputs</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-2 text-sm text-neutral-600 dark:text-neutral-300">
              Amount per buy (USD)
              <input
                type="number"
                min={0}
                step={1}
                value={amountPerPeriod}
                onChange={handleNumberChange(setAmountPerPeriod)}
                className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:text-white"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-neutral-600 dark:text-neutral-300">
              Frequency
              <select
                value={schedule}
                onChange={(event) => setSchedule(event.target.value as Schedule)}
                className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:text-white"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-neutral-600 dark:text-neutral-300">
              Fee rate (%)
              <input
                type="number"
                min={0}
                step={0.01}
                value={feeRate}
                onChange={handleNumberChange(setFeeRate)}
                className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:text-white"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-neutral-600 dark:text-neutral-300">
              History window
              <input
                type="text"
                value={`Last ${historyLimit} days (as of ${defaultEnd})`}
                readOnly
                className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none dark:text-white"
              />
            </label>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => fetchHistorical()}
              className="rounded-full border border-transparent bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-white shadow-sm transition hover:bg-brand/90"
              disabled={loading}
            >
              {loading ? "Fetching..." : "Fetch data"}
            </button>
            <button
              type="button"
              onClick={runBacktest}
              className="rounded-full border border-transparent bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-white shadow-sm transition hover:bg-brand/90"
            >
              Run backtest
            </button>
          </div>
          <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
            If CoinDesk fetch fails due to CORS, use a backend proxy.
          </p>
          {error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Results</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Summary metrics and portfolio performance for your normal DCA plan.
            </p>
          </div>
          {backtest ? (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Contributed
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatCurrency(backtest.totalContributedUSD)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Final value
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatCurrency(backtest.finalValueUSD)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    ROI
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatPercent(backtest.roi)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    XIRR
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatPercent(backtest.xirr)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Max drawdown
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatPercent(backtest.maxDrawdown)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    BTC end
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatNumber(backtest.btc, 6)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Cash end
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatCurrency(lastBacktestPoint?.cashUSD ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Fees paid
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatCurrency(backtest.totalFeesUSD)}
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Portfolio value
                  </p>
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={valueChartData}
                        margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="dateStr" tick={{ fontSize: 11 }} minTickGap={24} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(value) => `$${Number(value).toLocaleString()}`}
                          width={80}
                        />
                        <Tooltip
                          formatter={(value) => formatCurrency(Number(value))}
                          labelClassName="text-xs"
                        />
                        <Line type="monotone" dataKey="value" stroke="#0EA5E9" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    ROI to date
                  </p>
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={roiChartData}
                        margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="dateStr" tick={{ fontSize: 11 }} minTickGap={24} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${value}%`} />
                        <Tooltip
                          formatter={(value) => `${Number(value).toFixed(2)}%`}
                          labelClassName="text-xs"
                        />
                        <Line type="monotone" dataKey="roi" stroke="#22C55E" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-[var(--border-subtle)] p-6 text-sm text-neutral-500">
              Run the backtest to see summary metrics and performance charts.
            </div>
          )}
        </section>

        <section className="space-y-4">
          <details className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
            <summary className="cursor-pointer text-lg font-semibold text-neutral-900 dark:text-white">
              Show audit table
            </summary>
            <div className="mt-4 overflow-x-auto">
              {backtest ? (
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                    <tr>
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Price</th>
                      <th className="py-2 pr-4">Deposit</th>
                      <th className="py-2 pr-4">Buy USD</th>
                      <th className="py-2 pr-4">Fee USD</th>
                      <th className="py-2 pr-4">BTC</th>
                      <th className="py-2 pr-4">Cash USD</th>
                      <th className="py-2 pr-4">Value USD</th>
                      <th className="py-2 pr-4">Contributed to date</th>
                      <th className="py-2 pr-4">ROI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {auditRows.map((row) => (
                      <tr key={row.dateStr} className="text-neutral-700 dark:text-neutral-200">
                        <td className="py-2 pr-4">{row.dateStr}</td>
                        <td className="py-2 pr-4">{formatCurrency(row.price)}</td>
                        <td className="py-2 pr-4">{row.depositUSD ? formatCurrency(row.depositUSD) : "—"}</td>
                        <td className="py-2 pr-4">{row.buyUSD ? formatCurrency(row.buyUSD) : "—"}</td>
                        <td className="py-2 pr-4">{row.feeUSD ? formatCurrency(row.feeUSD) : "—"}</td>
                        <td className="py-2 pr-4">{formatNumber(row.btc, 6)}</td>
                        <td className="py-2 pr-4">{formatCurrency(row.cashUSD)}</td>
                        <td className="py-2 pr-4">{formatCurrency(row.valueUSD)}</td>
                        <td className="py-2 pr-4">{formatCurrency(row.contributedToDate)}</td>
                        <td className="py-2 pr-4">{formatPercent(row.roi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-neutral-500">
                  Run the backtest to populate the audit table.
                </p>
              )}
            </div>
          </details>

          <details className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
            <summary className="cursor-pointer text-lg font-semibold text-neutral-900 dark:text-white">
              Show CSV export
            </summary>
            <div className="mt-4 space-y-3 text-sm text-neutral-600 dark:text-neutral-300">
              <p>
                Export your backtest to CSV for deeper analysis or sharing with your advisor.
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Run the backtest with your desired inputs.</li>
                <li>Review the audit table for any data gaps.</li>
                <li>Download the CSV file and save it to your local device.</li>
              </ol>
              <button
                type="button"
                onClick={handleExportCsv}
                className="rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-brand transition hover:bg-brand/20"
                disabled={!backtest}
              >
                Download CSV
              </button>
              {!backtest ? (
                <p className="text-xs text-neutral-500">Run the backtest to enable export.</p>
              ) : null}
            </div>
          </details>

          <details className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
            <summary className="cursor-pointer text-lg font-semibold text-neutral-900 dark:text-white">
              Exchange plan
            </summary>
            <div className="mt-4 space-y-6 text-sm text-neutral-600 dark:text-neutral-300">
              <p>
                This should be considered a planning document. Execution requires manual setup
                using your exchange’s recurring buy feature.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                  Exchange name
                  <input
                    type="text"
                    value={exchangeName}
                    onChange={(event) => setExchangeName(event.target.value)}
                    placeholder="e.g., Coinbase"
                    className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:text-white"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                  Start date
                  <input
                    type="date"
                    value={exchangeStartDate}
                    onChange={(event) => setExchangeStartDate(event.target.value)}
                    className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:text-white"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                  Frequency
                  <select
                    value={exchangeFrequency}
                    onChange={(event) => setExchangeFrequency(event.target.value as Schedule)}
                    className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:text-white"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                  Contribution amount (USD)
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={exchangeAmount}
                    onChange={handleNumberChange(setExchangeAmount)}
                    className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:text-white"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-neutral-600 dark:text-neutral-300 md:col-span-2">
                  Optional note
                  <textarea
                    value={exchangeNote}
                    onChange={(event) => setExchangeNote(event.target.value)}
                    placeholder="Add any reminders or settings you need."
                    rows={3}
                    className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:text-white"
                  />
                </label>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 text-sm text-neutral-700 dark:bg-white/5 dark:text-neutral-200">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                  Instruction set
                </p>
                <p className="mt-3 text-base font-semibold text-neutral-900 dark:text-white">
                  Every {exchangeFrequency}, buy ${exchangeAmount.toLocaleString()} of BTC.
                </p>
                <div className="mt-3 space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                  <p>{exchangeName ? `Exchange: ${exchangeName}` : "Exchange: choose your venue"}</p>
                  <p>Start date: {exchangeStartDate}</p>
                  {exchangeNote ? <p>Note: {exchangeNote}</p> : null}
                </div>
              </div>
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}
