import { useEffect, useMemo, useRef, useState } from "react";
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
  start: string;
  end: string;
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
  historyStart?: string;
  historyEnd?: string;
};

const SCHEDULES_PER_YEAR: Record<Schedule, number> = {
  daily: 365,
  weekly: 52,
  biweekly: 26,
  monthly: 12,
};

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `$${value.toLocaleString()}`;
}

function formatCompactCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
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

function InfoTooltip({ label }: { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[0.6rem] font-semibold text-neutral-500 transition hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
    >
      i
    </button>
  );
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

function loadCachedHistorical(limit: number, start: string, end: string): HistoricalRow[] | null {
  try {
    const raw = localStorage.getItem(HISTORICAL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HistoricalCache;
    if (
      parsed.limit !== limit ||
      parsed.start !== start ||
      parsed.end !== end ||
      !Array.isArray(parsed.rows)
    ) {
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

function saveCachedHistorical(limit: number, start: string, end: string, rows: HistoricalRow[]) {
  const payload: HistoricalCache = {
    limit,
    start,
    end,
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
  const defaultStart = formatDateInput(
    new Date(today.getFullYear() - 4, today.getMonth(), today.getDate()),
  );

  const [rows, setRows] = useState<HistoricalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Schedule>("weekly");
  const [amountPerPeriod, setAmountPerPeriod] = useState(100);
  const [feeRate, setFeeRate] = useState(0.25);
  const [historyStart, setHistoryStart] = useState(defaultStart);
  const [historyEnd, setHistoryEnd] = useState(defaultEnd);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [isMobileChart, setIsMobileChart] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const lastFetchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobileChart(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const title = "Bitcoin Buying Strategies | Bitcoin Square";
    const description =
      "Test a simple plan for buying Bitcoin on a schedule, without selling.";
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
      if (parsed.historyStart) setHistoryStart(parsed.historyStart);
      if (parsed.historyEnd) setHistoryEnd(parsed.historyEnd);
    } catch {
      // Ignore settings hydration failures.
    }
  }, []);

  useEffect(() => {
    const payload: SettingsCache = {
      schedule,
      amountPerPeriod,
      feeRate,
      historyStart,
      historyEnd,
    };
    try {
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore settings persistence failures.
    }
  }, [schedule, amountPerPeriod, feeRate, historyStart, historyEnd]);

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
    const fetchKey = `${historyStart}|${historyEnd}`;
    const requestId = ++requestIdRef.current;
    try {
      const nextRows = await fetchHistoricalData();
      if (requestId !== requestIdRef.current) return;
      lastFetchKeyRef.current = fetchKey;
      setRows(nextRows);
      runBacktestWithRows(nextRows);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const message = err instanceof Error ? err.message : "Unable to load historical prices.";
      setError(message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchHistoricalData = async () => {
    const startDate = new Date(`${historyStart}T00:00:00Z`);
    const endDate = new Date(`${historyEnd}T00:00:00Z`);
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      startDate.getTime() > endDate.getTime()
    ) {
      throw new Error("Select a valid start and end date.");
    }
    const historyLimit =
      Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const cached = loadCachedHistorical(historyLimit, historyStart, historyEnd);
    if (Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
    const data = await fetchBtcDailyHistory({
      limit: historyLimit,
      toTs: Math.floor(endDate.getTime() / 1000),
    });
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
    const filtered = parsed.filter(
      (row) => row.date.getTime() >= startDate.getTime() && row.date.getTime() <= endDate.getTime(),
    );
    saveCachedHistorical(historyLimit, historyStart, historyEnd, filtered);
    return filtered;
  };

  useEffect(() => {
    setError(null);
    const fetchKey = `${historyStart}|${historyEnd}`;
    const currentRows = Array.isArray(rows) ? rows : [];
    const canReuse = lastFetchKeyRef.current === fetchKey && currentRows.length > 0;
    if (canReuse) {
      runBacktestWithRows(currentRows);
      return;
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      try {
        const nextRows = await fetchHistoricalData();
        if (requestId !== requestIdRef.current) return;
        lastFetchKeyRef.current = fetchKey;
        setRows(nextRows);
        runBacktestWithRows(nextRows);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        const message = err instanceof Error ? err.message : "Unable to load historical prices.";
        setError(message);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 600);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [historyStart, historyEnd, amountPerPeriod, schedule, feeRate, rows]);

  const safeRows = Array.isArray(rows) ? rows : [];
  const backtestHistory = Array.isArray(backtest?.history) ? backtest?.history : [];
  const lastBacktestPoint = backtestHistory.at(-1);
  const hasHistory = safeRows.length > 0;
  const startDate = hasHistory ? safeRows[0].dateStr : defaultEnd;
  const endDate = hasHistory ? safeRows[safeRows.length - 1].dateStr : defaultEnd;
  const startPrice = lastBacktestPoint?.price ?? safeRows.at(-1)?.price ?? 0;
  const startBtc = backtest?.btc ?? 0;
  const startCash = lastBacktestPoint?.cashUSD ?? 0;
  const dcaPerPeriod = amountPerPeriod ?? 0;
  const schedulePerYear = SCHEDULES_PER_YEAR[schedule] ?? 0;
  const growthRates = [0.2, 0.3, 0.4, 0.5];
  const projectionYears = [1, 2, 5, 10];
  const projectionMonths = 120;
  const projectedResults = backtest
    ? growthRates.map((rate) => {
        const perPeriodRate = schedulePerYear > 0 ? (1 + rate) ** (1 / schedulePerYear) - 1 : 0;
        return {
          rate,
          results: projectionYears.map((years) => {
            let price = startPrice;
            let btc = startBtc;
            let cash = startCash;
            const totalPeriods = Math.round(schedulePerYear * years);
            for (let i = 0; i < totalPeriods; i += 1) {
              cash += dcaPerPeriod;
              if (price > 0 && cash > 0) {
                btc += cash / price;
                cash = 0;
              }
              price *= 1 + perPeriodRate;
            }
            const finalValue = btc * price + cash;
            return {
              years,
              finalValue,
            };
          }),
        };
      })
    : [];
  const projectedChartData =
    backtest && startPrice > 0 && schedulePerYear > 0
      ? Array.from({ length: projectionMonths + 1 }, (_, month) => {
          const entry: Record<string, number> = { month };
          growthRates.forEach((rate) => {
            const monthlyRate = (1 + rate) ** (1 / 12) - 1;
            const monthlyContribution = dcaPerPeriod * (schedulePerYear / 12);
            let price = startPrice;
            let btc = startBtc;
            let cash = startCash;

            for (let i = 0; i < month; i += 1) {
              cash += monthlyContribution;
              if (price > 0 && cash > 0) {
                btc += cash / price;
                cash = 0;
              }
              price *= 1 + monthlyRate;
            }

            entry[`${Math.round(rate * 100)}%`] = btc * price + cash;
          });
          return entry;
        })
      : [];

  const runBacktestWithRows = (inputRows: HistoricalRow[]) => {
    if (!inputRows.length) {
      setBacktest(null);
      setError("Load price history before running the test.");
      return;
    }

    const scheduledRows = pickSchedulePoints(inputRows, schedule);
    const scheduledDates = new Set(scheduledRows.map((row) => row.dateStr));
    let cashUSD = 0;
    let totalContributedUSD = 0;
    let totalFeesUSD = 0;
    let btc = 0;

    const history = inputRows.map((row) => {
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

  const runBacktest = () => {
    runBacktestWithRows(safeRows);
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

  const auditRows = Array.isArray(backtestHistory) ? backtestHistory : [];

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
            Bitcoin Buying Strategies
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
            Bitcoin Buying Strategies
          </p>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            Simple Bitcoin Buying Plan (No Selling)
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Try a simple plan where you buy Bitcoin on a schedule and never sell.
          </p>
        </header>

        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                Bitcoin price history
              </p>
              <h2 className="mt-2 text-lg font-semibold text-neutral-900 dark:text-white">
                Past Bitcoin closing prices (USD)
              </h2>
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {safeRows.length ? `${safeRows.length} data points` : "No data available"}
            </div>
          </div>
          <div className="mt-6 h-80">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                Loading price history...
              </div>
            ) : safeRows.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="dateStr" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) =>
                      isMobileChart ? formatCompactCurrency(Number(value)) : `$${Number(value).toLocaleString()}`
                    }
                    width={isMobileChart ? 48 : 80}
                    tickMargin={isMobileChart ? -20 : 8}
                  />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} labelClassName="text-xs" />
                  <Line type="monotone" dataKey="price" stroke="#F97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                No price data available yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Plan inputs</h2>
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
              Fee rate (%) (what the exchange charges)
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
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="date"
                  value={historyStart}
                  max={historyEnd}
                  onChange={(event) => setHistoryStart(event.target.value)}
                  className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:text-white"
                />
                <input
                  type="date"
                  value={historyEnd}
                  min={historyStart}
                  max={defaultEnd}
                  onChange={(event) => setHistoryEnd(event.target.value)}
                  className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:text-white"
                />
              </div>
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
              Run test
            </button>
          </div>
          <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
            If price data does not load, a backend proxy may be required.
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
              A simple summary of how your plan would have performed.
            </p>
          </div>
          {loading && !hasHistory ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[var(--border-subtle)] p-6 text-sm text-neutral-500">
              Loading data...
            </div>
          ) : backtest ? (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Total contributed
                    <InfoTooltip label="Total dollars you have put into the plan so far." />
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatCurrency(backtest.totalContributedUSD)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Final value
                    <InfoTooltip label="Total value of your Bitcoin plus any leftover cash." />
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatCurrency(backtest.finalValueUSD)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Return (ROI)
                    <InfoTooltip label="Return on investment: how much you gained or lost compared to what you put in." />
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatPercent(backtest.roi)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Annual return (XIRR)
                    <InfoTooltip label="Yearly return, adjusted for when each deposit was made." />
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatPercent(backtest.xirr)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Biggest drop (drawdown)
                    <InfoTooltip label="Largest drop from a high point to a low point during the period." />
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatPercent(backtest.maxDrawdown)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Bitcoin held
                    <InfoTooltip label="Total Bitcoin you would have accumulated by the end." />
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatNumber(backtest.btc, 6)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Cash held
                    <InfoTooltip label="Cash left over after your scheduled buys." />
                  </p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {formatCurrency(lastBacktestPoint?.cashUSD ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Fees
                    <InfoTooltip label="Total fees charged by the exchange during the buys." />
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
                          tickFormatter={(value) =>
                            isMobileChart
                              ? formatCompactCurrency(Number(value))
                              : `$${Number(value).toLocaleString()}`
                          }
                          width={isMobileChart ? 48 : 80}
                          tickMargin={isMobileChart ? -20 : 8}
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
                    Return to date (ROI)
                  </p>
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={roiChartData}
                        margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="dateStr" tick={{ fontSize: 11 }} minTickGap={24} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(value) => `${Number(value).toFixed(isMobileChart ? 0 : 1)}%`}
                          width={isMobileChart ? 40 : 60}
                          tickMargin={isMobileChart ? -16 : 8}
                        />
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
              <div className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-white/60 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
                    Projected results
                    <InfoTooltip label="Simple estimates based on steady growth and continued buying." />
                  </p>
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                    What you’re looking at: these are hypothetical projections assuming Bitcoin grows at the
                    listed yearly rates and you keep buying the same amount.
                  </p>
                {startPrice > 0 && schedulePerYear > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                        <tr>
                          <th className="py-2 pr-4">
                            Yearly growth
                            <InfoTooltip label="Fixed yearly Bitcoin price increase used for this scenario." />
                          </th>
                          {projectionYears.map((years) => (
                            <th key={years} className="py-2 pr-4">
                              {years}y
                              <InfoTooltip
                                label={`Projected portfolio value after ${years} year${
                                  years === 1 ? "" : "s"
                                } of continued buying.`}
                              />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {projectedResults.map((projection) => (
                          <tr key={projection.rate} className="text-neutral-700 dark:text-neutral-200">
                            <td className="py-2 pr-4 font-semibold">
                              {(projection.rate * 100).toFixed(0)}%
                            </td>
                            {projection.results.map((result) => (
                              <td key={result.years} className="py-2 pr-4">
                                {formatCurrency(result.finalValue)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-neutral-500">
                    No data available.
                  </p>
                )}
                {projectedChartData.length ? (
                  <div className="mt-6 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={projectedChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(value) => `${Math.round(Number(value) / 12)}y`}
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(value) =>
                            isMobileChart
                              ? formatCompactCurrency(Number(value))
                              : `$${Number(value).toLocaleString()}`
                          }
                          width={isMobileChart ? 48 : 80}
                          tickMargin={isMobileChart ? -20 : 8}
                        />
                        <Tooltip
                          formatter={(value) => formatCurrency(Number(value))}
                          labelFormatter={(value) => `Month ${value}`}
                          labelClassName="text-xs"
                        />
                        {growthRates.map((rate) => (
                          <Line
                            key={rate}
                            type="monotone"
                            dataKey={`${Math.round(rate * 100)}%`}
                            strokeWidth={2}
                            dot={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}
              </div>
            </>
          ) : !hasHistory ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[var(--border-subtle)] p-6 text-sm text-neutral-500">
              No data available.
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-[var(--border-subtle)] p-6 text-sm text-neutral-500">
              Run the test to see summary numbers and charts.
            </div>
          )}
        </section>

        <section className="space-y-4">
          <details className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
            <summary className="cursor-pointer text-lg font-semibold text-neutral-900 dark:text-white">
              Show detailed table
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
                      <th className="py-2 pr-4">Bitcoin</th>
                      <th className="py-2 pr-4">Cash USD</th>
                      <th className="py-2 pr-4">Value USD</th>
                      <th className="py-2 pr-4">Contributed to date</th>
                      <th className="py-2 pr-4">Return (ROI)</th>
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
                  Run the test to populate the table.
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
                Export your results to CSV for a closer look or to share.
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Run the test with your desired inputs.</li>
                <li>Review the detailed table for any gaps.</li>
                <li>Download the CSV file and save it to your device.</li>
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
                <p className="text-xs text-neutral-500">Run the test to enable export.</p>
              ) : null}
            </div>
          </details>

          <details className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
            <summary className="cursor-pointer text-lg font-semibold text-neutral-900 dark:text-white">
              How to do this on an exchange
            </summary>
            <div className="mt-4 space-y-6 text-sm text-neutral-600 dark:text-neutral-300">
              <p>Set up a recurring buy on your exchange using the same amount and timing.</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Open your exchange’s recurring buy or auto-buy feature.</li>
                <li>Choose Bitcoin as the asset to buy.</li>
                <li>Set the buy amount to match your plan.</li>
                <li>Pick the same schedule (daily, weekly, etc.).</li>
                <li>Review and turn it on.</li>
              </ul>
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}
