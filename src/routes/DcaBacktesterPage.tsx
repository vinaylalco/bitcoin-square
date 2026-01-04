import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Navigate } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { cn } from "../utils/cn";

const COINDESK_CURRENT_URL = "https://api.coindesk.com/v1/bpi/currentprice/USD.json";
const COINDESK_HISTORICAL_URL = "https://data-api.coindesk.com/spot/v1/historical/days";
const COINDESK_API_KEY = import.meta.env.VITE_COINDESK_API_KEY ?? "";
const HISTORICAL_CACHE_KEY = "dca-backtester-historical-cache";
const SETTINGS_CACHE_KEY = "dca-backtester-settings";

type RiskParts = {
  rMA: number | null;
  rDD: number | null;
  rVOL: number | null;
};

type HistoricalRow = {
  dateStr: string;
  date: Date;
  price: number;
  risk?: number | null;
  _riskParts?: RiskParts;
};

type Schedule = "daily" | "weekly" | "biweekly" | "monthly";

type StrategyPoint = {
  dateStr: string;
  date: Date;
  price: number;
  risk: number | null;
  extraDeployPct: number;
  tierLabel: string | null;
  buy: number;
  fee: number;
  contributed: number;
  invested: number;
  cash: number;
  btc: number;
  value: number;
};

type StrategyResult = {
  history: StrategyPoint[];
  contributed: number;
  invested: number;
  cash: number;
  btc: number;
  finalValue: number;
  roi: number | null;
  xirr: number | null;
  maxDrawdown: number | null;
};

type HistoricalCache = {
  start: string;
  end: string;
  rows: { dateStr: string; price: number }[];
  savedAt: number;
};

type SettingsCache = {
  startDate: string;
  endDate: string;
  maWindowDays: number;
  drawdownWindowDays: number;
  volWindowDays: number;
  maLogRange: number;
  maxDrawdownForZeroRisk: number;
  volTarget: number;
  weightMA: number;
  weightDD: number;
  weightVOL: number;
  schedule: Schedule;
  amountPerPeriod: number;
  feeRate: number;
  strategyMode: "normal" | "threshold";
  thresholdPreset: "balanced" | "conservative" | "aggressive" | "custom";
  buyThreshold: number;
  deepDeployTiers: Array<{ threshold: number; deployPct: number }>;
  maxBuyCap: number | null;
  baseBuyMode: "deposit" | "0";
};

type DeployTier = {
  threshold: number;
  deployPct: number;
};

function formatPercent(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `$${value.toLocaleString()}`;
}

function formatDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseHistoricalRows(payload: {
  Data?: Array<{ TIMESTAMP?: number; CLOSE?: number }>;
}): HistoricalRow[] {
  const entries = Array.isArray(payload.Data) ? payload.Data : [];
  return entries
    .map((row) => {
      const timestamp = typeof row.TIMESTAMP === "number" ? row.TIMESTAMP : null;
      const price = typeof row.CLOSE === "number" ? row.CLOSE : null;
      if (!timestamp || price == null) {
        return null;
      }
      const date = new Date(timestamp * 1000);
      const dateStr = date.toISOString().slice(0, 10);
      return { dateStr, date, price };
    })
    .filter((row): row is HistoricalRow => row !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function loadCachedHistorical(start: string, end: string): HistoricalRow[] | null {
  try {
    const raw = localStorage.getItem(HISTORICAL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HistoricalCache;
    if (parsed.start !== start || parsed.end !== end || !Array.isArray(parsed.rows)) {
      return null;
    }
    return parsed.rows.map((row) => ({
      dateStr: row.dateStr,
      date: new Date(`${row.dateStr}T00:00:00Z`),
      price: row.price,
    }));
  } catch {
    return null;
  }
}

function saveCachedHistorical(start: string, end: string, rows: HistoricalRow[]) {
  const payload: HistoricalCache = {
    start,
    end,
    rows: rows.map((row) => ({ dateStr: row.dateStr, price: row.price })),
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(HISTORICAL_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore cache write failures.
  }
}

function isScheduleHit(date: Date, startDate: Date, schedule: Schedule): boolean {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const daysSinceStart = Math.floor((date.getTime() - startDate.getTime()) / MS_PER_DAY);

  if (schedule === "daily") {
    return daysSinceStart >= 0;
  }
  if (schedule === "weekly") {
    return daysSinceStart % 7 === 0;
  }
  if (schedule === "biweekly") {
    return daysSinceStart % 14 === 0;
  }
  if (schedule === "monthly") {
    return date.getUTCDate() === startDate.getUTCDate();
  }
  return false;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function calculateMaxDrawdown(values: number[]): number | null {
  if (!values.length) return null;
  let peak = values[0];
  let maxDrawdown = 0;
  values.forEach((value) => {
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
  cashflows: Array<{ date: Date; amount: number }>,
  maxIterations = 50,
): number | null {
  if (cashflows.length < 2) return null;
  const hasPositive = cashflows.some((flow) => flow.amount > 0);
  const hasNegative = cashflows.some((flow) => flow.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const baseDate = cashflows[0].date;
  const times = cashflows.map((flow) => ({
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

export default function DcaBacktesterPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const defaultEnd = formatDateInput(today);
  const defaultStart = formatDateInput(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30),
  );

  // QA checklist:
  // - CoinDesk fetch works and errors gracefully
  // - Charts render on mobile
  // - Table scrolls and CSV downloads
  // - Results are consistent after refresh due to persistence
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [rows, setRows] = useState<HistoricalRow[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maWindowDays, setMaWindowDays] = useState(200);
  const [drawdownWindowDays, setDrawdownWindowDays] = useState(365);
  const [volWindowDays, setVolWindowDays] = useState(30);
  const [maLogRange, setMaLogRange] = useState(0.6);
  const [maxDrawdownForZeroRisk, setMaxDrawdownForZeroRisk] = useState(0.8);
  const [volTarget, setVolTarget] = useState(0.05);
  const [weightMA, setWeightMA] = useState(0.5);
  const [weightDD, setWeightDD] = useState(0.35);
  const [weightVOL, setWeightVOL] = useState(0.15);
  const [schedule, setSchedule] = useState<Schedule>("weekly");
  const [amountPerPeriod, setAmountPerPeriod] = useState(100);
  const [feeRate, setFeeRate] = useState(0.25);
  const [strategyMode, setStrategyMode] = useState<"normal" | "threshold">("threshold");
  const [thresholdPreset, setThresholdPreset] = useState<
    "balanced" | "conservative" | "aggressive" | "custom"
  >("balanced");
  const [buyThreshold, setBuyThreshold] = useState(0.55);
  const [deepDeployTiers, setDeepDeployTiers] = useState<DeployTier[]>([
    { threshold: 0.35, deployPct: 0.15 },
    { threshold: 0.25, deployPct: 0.35 },
    { threshold: 0.15, deployPct: 0.8 },
  ]);
  const [maxBuyCap, setMaxBuyCap] = useState<number | null>(null);
  const [baseBuyMode, setBaseBuyMode] = useState<"deposit" | "0">("0");
  const [activeTab, setActiveTab] = useState("strategy");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showResultsCharts, setShowResultsCharts] = useState(false);
  const [showResultsTable, setShowResultsTable] = useState(false);
  const [showProsConsMore, setShowProsConsMore] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizerResult, setOptimizerResult] = useState<{
    params: {
      buyThreshold: number;
      deepDeployTiers: DeployTier[];
      tierLabel: string;
    };
    finalValue: number;
  } | null>(null);

  useEffect(() => {
    const title = "BTC DCA Backtester | Compare DCA vs Lump Sum vs Hybrid Strategies";
    const description =
      "Compare Bitcoin dollar-cost averaging, lump-sum, and blended strategies with a risk-weighted DCA calculator.";
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
    ensureMeta("keywords", "bitcoin dca, dca calculator, lump sum vs dca, btc backtester");
    ensureMeta("og:title", title, "property");
    ensureMeta("og:description", description, "property");
    ensureMeta("twitter:description", description);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SettingsCache>;
      if (typeof parsed.startDate === "string") setStartDate(parsed.startDate);
      if (typeof parsed.endDate === "string") setEndDate(parsed.endDate);
      if (parsed.maWindowDays != null) setMaWindowDays(parsed.maWindowDays);
      if (parsed.drawdownWindowDays != null) setDrawdownWindowDays(parsed.drawdownWindowDays);
      if (parsed.volWindowDays != null) setVolWindowDays(parsed.volWindowDays);
      if (parsed.maLogRange != null) setMaLogRange(parsed.maLogRange);
      if (parsed.maxDrawdownForZeroRisk != null) {
        setMaxDrawdownForZeroRisk(parsed.maxDrawdownForZeroRisk);
      }
      if (parsed.volTarget != null) setVolTarget(parsed.volTarget);
      if (parsed.weightMA != null) setWeightMA(parsed.weightMA);
      if (parsed.weightDD != null) setWeightDD(parsed.weightDD);
      if (parsed.weightVOL != null) setWeightVOL(parsed.weightVOL);
      if (parsed.schedule) setSchedule(parsed.schedule);
      if (parsed.amountPerPeriod != null) setAmountPerPeriod(parsed.amountPerPeriod);
      if (parsed.feeRate != null) setFeeRate(parsed.feeRate);
      if (parsed.strategyMode) setStrategyMode(parsed.strategyMode);
      if (parsed.thresholdPreset) setThresholdPreset(parsed.thresholdPreset);
      if (parsed.buyThreshold != null) setBuyThreshold(parsed.buyThreshold);
      if (Array.isArray(parsed.deepDeployTiers)) {
        const parsedTiers = parsed.deepDeployTiers
          .map((tier) => ({
            threshold: typeof tier.threshold === "number" ? tier.threshold : null,
            deployPct: typeof tier.deployPct === "number" ? tier.deployPct : null,
          }))
          .filter(
            (tier): tier is { threshold: number; deployPct: number } =>
              tier.threshold != null && tier.deployPct != null,
          );
        if (parsedTiers.length) {
          setDeepDeployTiers(parsedTiers);
        }
      }
      if (parsed.maxBuyCap != null) setMaxBuyCap(parsed.maxBuyCap);
      if (parsed.baseBuyMode) setBaseBuyMode(parsed.baseBuyMode);
    } catch {
      // Ignore settings hydration failures.
    }
  }, []);

  useEffect(() => {
    const payload: SettingsCache = {
      startDate,
      endDate,
      maWindowDays,
      drawdownWindowDays,
      volWindowDays,
      maLogRange,
      maxDrawdownForZeroRisk,
      volTarget,
      weightMA,
      weightDD,
      weightVOL,
      schedule,
      amountPerPeriod,
      feeRate,
      strategyMode,
      thresholdPreset,
      buyThreshold,
      deepDeployTiers,
      maxBuyCap,
      baseBuyMode,
    };
    try {
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore settings persistence failures.
    }
  }, [
    startDate,
    endDate,
    maWindowDays,
    drawdownWindowDays,
    volWindowDays,
    maLogRange,
    maxDrawdownForZeroRisk,
    volTarget,
    weightMA,
    weightDD,
    weightVOL,
    schedule,
    amountPerPeriod,
    feeRate,
    strategyMode,
    thresholdPreset,
    buyThreshold,
    deepDeployTiers,
    maxBuyCap,
    baseBuyMode,
  ]);

  const handleNumberChange =
    (setter: (value: number) => void) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      if (Number.isFinite(next)) {
        setter(next);
      }
    };

  const handleMaxBuyCapChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (!value) {
      setMaxBuyCap(null);
      setThresholdPreset("custom");
      return;
    }
    const next = Number(value);
    if (Number.isFinite(next)) {
      setMaxBuyCap(next);
      setThresholdPreset("custom");
    }
  };

  const handleTierChange =
    (index: number, field: keyof DeployTier) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      if (!Number.isFinite(next)) return;
      setDeepDeployTiers((prev) =>
        prev.map((tier, tierIndex) =>
          tierIndex === index ? { ...tier, [field]: next } : tier,
        ),
      );
      setThresholdPreset("custom");
    };

  const handleThresholdNumberChange =
    (setter: (value: number) => void) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      if (Number.isFinite(next)) {
        setter(next);
        setThresholdPreset("custom");
      }
    };

  const thresholdPresets = useMemo(
    () => ({
      conservative: {
        buyThreshold: 0.5,
        deepDeployTiers: [
          { threshold: 0.35, deployPct: 0.1 },
          { threshold: 0.25, deployPct: 0.25 },
          { threshold: 0.15, deployPct: 0.6 },
        ],
        baseBuyMode: "0" as const,
      },
      balanced: {
        buyThreshold: 0.55,
        deepDeployTiers: [
          { threshold: 0.35, deployPct: 0.15 },
          { threshold: 0.25, deployPct: 0.35 },
          { threshold: 0.15, deployPct: 0.8 },
        ],
        baseBuyMode: "0" as const,
      },
      aggressive: {
        buyThreshold: 0.6,
        deepDeployTiers: [
          { threshold: 0.4, deployPct: 0.2 },
          { threshold: 0.3, deployPct: 0.45 },
          { threshold: 0.2, deployPct: 0.9 },
        ],
        baseBuyMode: "0" as const,
      },
    }),
    [],
  );

  const applyThresholdPreset = (preset: "balanced" | "conservative" | "aggressive") => {
    const values = thresholdPresets[preset];
    setThresholdPreset(preset);
    setBuyThreshold(values.buyThreshold);
    setDeepDeployTiers(values.deepDeployTiers);
    setBaseBuyMode(values.baseBuyMode);
  };

  useEffect(() => {
    let isMounted = true;
    const loadCurrent = async () => {
      try {
        const url = new URL(COINDESK_CURRENT_URL);
        if (COINDESK_API_KEY) {
          url.searchParams.set("api_key", COINDESK_API_KEY);
        }
        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`CoinDesk current price failed (${response.status}).`);
        }
        const data = (await response.json()) as { bpi?: { USD?: { rate_float?: number } } };
        const price = data.bpi?.USD?.rate_float;
        if (typeof price !== "number") {
          throw new Error("CoinDesk current price missing.");
        }
        if (isMounted) {
          setCurrentPrice(price);
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : "Unable to load current price.";
          setError(message);
        }
      }
    };

    loadCurrent();
    return () => {
      isMounted = false;
    };
  }, []);

  const fetchHistorical = async (start: string, end: string) => {
    setError(null);
    setLoading(true);
    const cached = loadCachedHistorical(start, end);
    if (cached && cached.length > 0) {
      setRows(cached);
      setLoading(false);
      return;
    }
    try {
      const startDate = new Date(`${start}T00:00:00Z`);
      const endDate = new Date(`${end}T00:00:00Z`);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new Error("Invalid start or end date.");
      }
      const msPerDay = 24 * 60 * 60 * 1000;
      const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / msPerDay);
      if (diffDays < 0) {
        throw new Error("End date must be on or after start date.");
      }
      const limit = diffDays + 1;
      const url = new URL(COINDESK_HISTORICAL_URL);
      url.searchParams.set("market", "kraken");
      url.searchParams.set("instrument", "BTC-USD");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("aggregate", "1");
      url.searchParams.set("fill", "true");
      url.searchParams.set("apply_mapping", "true");
      url.searchParams.set("response_format", "JSON");
      url.searchParams.set("to_ts", String(Math.floor(endDate.getTime() / 1000)));
      if (COINDESK_API_KEY) {
        url.searchParams.set("api_key", COINDESK_API_KEY);
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`CoinDesk historical data failed (${response.status}).`);
      }
      const data = (await response.json()) as {
        Data?: Array<{ TIMESTAMP?: number; CLOSE?: number }>;
      };
      const parsed = parseHistoricalRows(data);
      setRows(parsed);
      saveCachedHistorical(start, end, parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load historical prices.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHistorical(startDate, endDate);
  }, [startDate, endDate]);

  const riskRows = useMemo(() => {
    if (!rows.length) return [];

    const prices = rows.map((row) => row.price);
    const logReturns = prices.map((price, index) => {
      if (index === 0) return null;
      const prev = prices[index - 1];
      if (!prev || prev <= 0 || price <= 0) return null;
      return Math.log(price / prev);
    });

    const windowAverage = (values: number[], endIndex: number, windowSize: number) => {
      const startIndex = endIndex - windowSize + 1;
      if (startIndex < 0) return null;
      let sum = 0;
      for (let i = startIndex; i <= endIndex; i += 1) {
        sum += values[i];
      }
      return sum / windowSize;
    };

    const windowMax = (values: number[], endIndex: number, windowSize: number) => {
      const startIndex = endIndex - windowSize + 1;
      if (startIndex < 0) return null;
      let maxValue = -Infinity;
      for (let i = startIndex; i <= endIndex; i += 1) {
        if (values[i] > maxValue) {
          maxValue = values[i];
        }
      }
      return Number.isFinite(maxValue) ? maxValue : null;
    };

    const windowStd = (values: Array<number | null>, endIndex: number, windowSize: number) => {
      const startIndex = endIndex - windowSize + 1;
      if (startIndex < 1) return null;
      const slice: number[] = [];
      for (let i = startIndex; i <= endIndex; i += 1) {
        const value = values[i];
        if (value == null) return null;
        slice.push(value);
      }
      if (!slice.length) return null;
      const mean = slice.reduce((acc, value) => acc + value, 0) / slice.length;
      const variance =
        slice.reduce((acc, value) => acc + (value - mean) ** 2, 0) / slice.length;
      return Math.sqrt(variance);
    };

    return rows.map((row, index) => {
      const price = row.price;
      const rMA =
        maWindowDays > 0 && maLogRange > 0 && index + 1 >= maWindowDays
          ? (() => {
              const ma = windowAverage(prices, index, maWindowDays);
              if (!ma || ma <= 0) return null;
              const x = Math.log(price / ma);
              return clamp((x + maLogRange) / (2 * maLogRange));
            })()
          : null;

      const rDD =
        drawdownWindowDays > 0 && maxDrawdownForZeroRisk > 0 && index + 1 >= drawdownWindowDays
          ? (() => {
              const hi = windowMax(prices, index, drawdownWindowDays);
              if (!hi || hi <= 0) return null;
              const dd = price / hi - 1;
              return clamp(1 + dd / maxDrawdownForZeroRisk);
            })()
          : null;

      const rVOL =
        volWindowDays > 0 && volTarget > 0 && index + 1 >= volWindowDays
          ? (() => {
              const vol = windowStd(logReturns, index, volWindowDays);
              if (vol == null) return null;
              return clamp(vol / volTarget);
            })()
          : null;

      const components: Array<{ value: number | null; weight: number }> = [
        { value: rMA, weight: weightMA },
        { value: rDD, weight: weightDD },
        { value: rVOL, weight: weightVOL },
      ];
      const available = components.filter((item) => item.value != null && item.weight > 0);
      const weightSum = available.reduce((acc, item) => acc + item.weight, 0);
      const risk =
        weightSum > 0
          ? clamp(
              available.reduce((acc, item) => acc + (item.value as number) * item.weight, 0) /
                weightSum,
            )
          : null;

      return {
        ...row,
        risk,
        _riskParts: { rMA, rDD, rVOL },
      };
    });
  }, [
    drawdownWindowDays,
    maLogRange,
    maWindowDays,
    maxDrawdownForZeroRisk,
    rows,
    volTarget,
    volWindowDays,
    weightDD,
    weightMA,
    weightVOL,
  ]);

  const latestRiskRow = useMemo(() => {
    for (let i = riskRows.length - 1; i >= 0; i -= 1) {
      if (riskRows[i].risk != null) {
        return riskRows[i];
      }
    }
    return null;
  }, [riskRows]);

  const rowsSummary = rows.length
    ? `${rows.length} daily closes loaded from ${rows[0].dateStr} to ${rows[rows.length - 1].dateStr}.`
    : "No historical data loaded yet.";

  const backtestResults = useMemo(() => {
    if (!riskRows.length) {
      return null;
    }

    const safeAmount = amountPerPeriod > 0 ? amountPerPeriod : 0;
    const safeFeeRate = feeRate > 0 ? feeRate / 100 : 0;
    const start = riskRows[0].date;

    const resolvedTiers = [...deepDeployTiers].sort((a, b) => a.threshold - b.threshold);

    const resolveTier = (riskValue: number | null) => {
      if (riskValue == null) {
        return { deployPct: 0, label: null };
      }
      for (let i = 0; i < resolvedTiers.length; i += 1) {
        const tier = resolvedTiers[i];
        if (riskValue <= tier.threshold) {
          return {
            deployPct: Math.max(0, tier.deployPct),
            label: `≤${tier.threshold.toFixed(2)}`,
          };
        }
      }
      return { deployPct: 0, label: null };
    };

    const resolvedMaxBuyCap = maxBuyCap != null && maxBuyCap > 0 ? maxBuyCap : null;

    const runStrategy = (mode: "normal" | "threshold"): StrategyResult => {
      let cash = 0;
      let btc = 0;
      let contributed = 0;
      let invested = 0;
      const history: StrategyPoint[] = [];
      const cashflows: Array<{ date: Date; amount: number }> = [];

      riskRows.forEach((row) => {
        const scheduleHit = isScheduleHit(row.date, start, schedule);
        let extraDeployPct = 0;
        let tierLabel: string | null = null;
        let buy = 0;
        let fee = 0;

        if (scheduleHit) {
          cash += safeAmount;
          contributed += safeAmount;
          cashflows.push({ date: row.date, amount: -safeAmount });

          if (mode === "threshold") {
            const riskValue = row.risk ?? 1;
            if (riskValue > buyThreshold) {
              buy = 0;
              extraDeployPct = 0;
              tierLabel = null;
            } else {
              const baseBuy = baseBuyMode === "deposit" ? safeAmount : 0;
              const tier = resolveTier(riskValue);
              extraDeployPct = tier.deployPct;
              tierLabel = tier.label;
              const extra = cash * extraDeployPct;
              buy = Math.min(cash, Math.max(0, baseBuy + extra));
            }
          } else {
            buy = Math.min(cash, Math.max(0, safeAmount));
          }

          if (resolvedMaxBuyCap != null) {
            buy = Math.min(buy, resolvedMaxBuyCap);
          }

          fee = buy * safeFeeRate;
          const netBuy = buy - fee;
          if (buy > 0 && row.price > 0) {
            btc += netBuy / row.price;
            cash -= buy;
            invested += buy;
          }
        }

        const value = cash + btc * row.price;
        history.push({
          dateStr: row.dateStr,
          date: row.date,
          price: row.price,
          risk: row.risk ?? null,
          extraDeployPct,
          tierLabel,
          buy,
          fee,
          contributed,
          invested,
          cash,
          btc,
          value,
        });
      });

      const finalValue = history.length ? history[history.length - 1].value : 0;
      if (history.length) {
        cashflows.push({ date: history[history.length - 1].date, amount: finalValue });
      }
      const roi = contributed > 0 ? (finalValue - contributed) / contributed : null;
      const xirr = calculateXirr(cashflows);
      const maxDrawdown = calculateMaxDrawdown(history.map((point) => point.value));

      return {
        history,
        contributed,
        invested,
        cash,
        btc,
        finalValue,
        roi,
        xirr,
        maxDrawdown,
      };
    };

    return {
      normal: runStrategy("normal"),
      dynamic: runStrategy(strategyMode === "threshold" ? "threshold" : "normal"),
    };
  }, [
    amountPerPeriod,
    baseBuyMode,
    buyThreshold,
    deepDeployTiers,
    feeRate,
    maxBuyCap,
    riskRows,
    schedule,
    strategyMode,
  ]);

  const runDynamicSimulation = useCallback(
    (params: {
      buyThreshold: number;
      deepDeployTiers: DeployTier[];
      maxBuyCap: number | null;
      baseBuyMode: "deposit" | "0";
    }) => {
      if (!riskRows.length) {
        return null;
      }
      const safeAmount = amountPerPeriod > 0 ? amountPerPeriod : 0;
      const safeFeeRate = feeRate > 0 ? feeRate / 100 : 0;
      const start = riskRows[0].date;

      let cash = 0;
      let btc = 0;
      let contributed = 0;
      let invested = 0;
      const history: StrategyPoint[] = [];
      const cashflows: Array<{ date: Date; amount: number }> = [];

      const resolvedTiers = [...params.deepDeployTiers].sort(
        (a, b) => a.threshold - b.threshold,
      );
      const resolvedMaxBuyCap =
        params.maxBuyCap != null && params.maxBuyCap > 0 ? params.maxBuyCap : null;

      const resolveTier = (riskValue: number | null) => {
        if (riskValue == null) {
          return { deployPct: 0, label: null };
        }
        for (let i = 0; i < resolvedTiers.length; i += 1) {
          const tier = resolvedTiers[i];
          if (riskValue <= tier.threshold) {
            return {
              deployPct: Math.max(0, tier.deployPct),
              label: `≤${tier.threshold.toFixed(2)}`,
            };
          }
        }
        return { deployPct: 0, label: null };
      };

      riskRows.forEach((row) => {
        const scheduleHit = isScheduleHit(row.date, start, schedule);
        let extraDeployPct = 0;
        let tierLabel: string | null = null;
        let buy = 0;
        let fee = 0;

        if (scheduleHit) {
          cash += safeAmount;
          contributed += safeAmount;
          cashflows.push({ date: row.date, amount: -safeAmount });

          const riskValue = row.risk ?? 1;
          if (riskValue > params.buyThreshold) {
            buy = 0;
            extraDeployPct = 0;
            tierLabel = null;
          } else {
            const baseBuy = params.baseBuyMode === "deposit" ? safeAmount : 0;
            const tier = resolveTier(riskValue);
            extraDeployPct = tier.deployPct;
            tierLabel = tier.label;
            const extra = cash * extraDeployPct;
            buy = Math.min(cash, Math.max(0, baseBuy + extra));
          }

          if (resolvedMaxBuyCap != null) {
            buy = Math.min(buy, resolvedMaxBuyCap);
          }

          fee = buy * safeFeeRate;
          const netBuy = buy - fee;
          if (buy > 0 && row.price > 0) {
            btc += netBuy / row.price;
            cash -= buy;
            invested += buy;
          }
        }

        const value = cash + btc * row.price;
        history.push({
          dateStr: row.dateStr,
          date: row.date,
          price: row.price,
          risk: row.risk ?? null,
          extraDeployPct,
          tierLabel,
          buy,
          fee,
          contributed,
          invested,
          cash,
          btc,
          value,
        });
      });

      const finalValue = history.length ? history[history.length - 1].value : 0;
      if (history.length) {
        cashflows.push({ date: history[history.length - 1].date, amount: finalValue });
      }
      const roi = contributed > 0 ? (finalValue - contributed) / contributed : null;
      const xirr = calculateXirr(cashflows);
      const maxDrawdown = calculateMaxDrawdown(history.map((point) => point.value));

      return {
        history,
        contributed,
        invested,
        cash,
        btc,
        finalValue,
        roi,
        xirr,
        maxDrawdown,
      } satisfies StrategyResult;
    },
    [amountPerPeriod, feeRate, riskRows, schedule],
  );

  const chartRiskData = useMemo(
    () =>
      riskRows.map((row) => ({
        date: row.dateStr,
        risk: row.risk,
        rMA: row._riskParts?.rMA ?? null,
        rDD: row._riskParts?.rDD ?? null,
        rVOL: row._riskParts?.rVOL ?? null,
        price: row.price,
      })),
    [riskRows],
  );

  const portfolioSeries = useMemo(() => {
    if (!backtestResults) return [];
    return backtestResults.normal.history.map((point, index) => {
      const dynamicPoint = backtestResults.dynamic.history[index];
      return {
        date: point.dateStr,
        normalValue: point.value,
        dynamicValue: dynamicPoint?.value ?? null,
        normalROI:
          point.contributed > 0 ? (point.value - point.contributed) / point.contributed : null,
        dynamicROI:
          dynamicPoint && dynamicPoint.contributed > 0
            ? (dynamicPoint.value - dynamicPoint.contributed) / dynamicPoint.contributed
            : null,
        normalBuy: point.buy,
        dynamicBuy: dynamicPoint?.buy ?? null,
        risk: point.risk,
      };
    });
  }, [backtestResults]);

  const dateRangeYears = useMemo(() => {
    if (!riskRows.length) return null;
    const start = riskRows[0].date;
    const end = riskRows[riskRows.length - 1].date;
    const years = (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return years > 0 ? years : null;
  }, [riskRows]);

  const computeCagrApprox = (finalValue: number, contributed: number) => {
    if (!dateRangeYears || contributed <= 0 || finalValue <= 0) return null;
    return (finalValue / contributed) ** (1 / dateRangeYears) - 1;
  };

  const handleExportCsv = () => {
    if (!backtestResults) return;
    const escapeCsv = (value: unknown) => {
      if (value == null) return "";
      const text = String(value);
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, "\"\"")}"`;
      }
      return text;
    };
    const header = [
      "date",
      "price",
      "risk",
      "extra_deploy_pct",
      "tier",
      "deposit",
      "buy_normal",
      "buy_risk",
      "btc_normal",
      "btc_risk",
      "cash_normal",
      "cash_risk",
      "value_normal",
      "value_risk",
    ];
    const rowsCsv = backtestResults.normal.history.map((normalPoint, index) => {
      const dynamicPoint = backtestResults.dynamic.history[index];
      const prevNormal = index > 0 ? backtestResults.normal.history[index - 1] : null;
      const deposit = prevNormal ? normalPoint.contributed - prevNormal.contributed : normalPoint.contributed;
      return [
        normalPoint.dateStr,
        normalPoint.price,
        normalPoint.risk ?? "",
        dynamicPoint?.extraDeployPct ?? "",
        dynamicPoint?.tierLabel ?? "",
        deposit,
        normalPoint.buy,
        dynamicPoint?.buy ?? "",
        normalPoint.btc,
        dynamicPoint?.btc ?? "",
        normalPoint.cash,
        dynamicPoint?.cash ?? "",
        normalPoint.value,
        dynamicPoint?.value ?? "",
      ];
    });
    const csvContent =
      [header, ...rowsCsv].map((row) => row.map(escapeCsv).join(",")).join("\n") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dca-backtest-${startDate}-${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const tabItems = [
    { id: "strategy", label: t("dca.tabs.strategy", { defaultValue: "Strategy" }) },
    { id: "results", label: t("dca.tabs.results", { defaultValue: "Results" }) },
    { id: "how", label: t("dca.tabs.howItWorks", { defaultValue: "How it works" }) },
  ];

  const isAdmin = user?.isAdmin === true;
  const xirrDiff =
    backtestResults?.dynamic.xirr != null && backtestResults.normal.xirr != null
      ? backtestResults.dynamic.xirr - backtestResults.normal.xirr
      : null;
  const xirrDiffLabel =
    xirrDiff != null ? `${xirrDiff >= 0 ? "+" : ""}${(xirrDiff * 100).toFixed(2)}%` : "—";
  const outperformance =
    backtestResults && backtestResults.normal.finalValue > 0
      ? (backtestResults.dynamic.finalValue - backtestResults.normal.finalValue) /
        backtestResults.normal.finalValue
      : null;

  if (!user) {
    return <Navigate to="/membership?view=login" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="bg-[var(--bg-app)] text-[var(--fg-default)]">
        <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
              DCA Backtester
            </p>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
              Access Restricted
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              You need admin access to use the DCA backtester.
            </p>
          </header>
        </main>
      </div>
    );
  }

  const handleOptimizer = () => {
    if (!isAdmin) return;
    if (!riskRows.length) {
      setOptimizerResult(null);
      return;
    }
    setIsOptimizing(true);
    setOptimizerResult(null);

    const buyThresholdGrid = [0.45, 0.5, 0.55, 0.6];
    const tierPresets = [
      {
        label: "Conservative",
        deepDeployTiers: [
          { threshold: 0.35, deployPct: 0.1 },
          { threshold: 0.25, deployPct: 0.25 },
          { threshold: 0.15, deployPct: 0.6 },
        ],
      },
      {
        label: "Balanced",
        deepDeployTiers: [
          { threshold: 0.35, deployPct: 0.15 },
          { threshold: 0.25, deployPct: 0.35 },
          { threshold: 0.15, deployPct: 0.8 },
        ],
      },
      {
        label: "Aggressive lows",
        deepDeployTiers: [
          { threshold: 0.4, deployPct: 0.2 },
          { threshold: 0.3, deployPct: 0.45 },
          { threshold: 0.2, deployPct: 0.9 },
        ],
      },
    ];

    let best: typeof optimizerResult = null;

    buyThresholdGrid.forEach((candidateThreshold) => {
      tierPresets.forEach((tierPreset) => {
        const result = runDynamicSimulation({
          buyThreshold: candidateThreshold,
          deepDeployTiers: tierPreset.deepDeployTiers,
          maxBuyCap,
          baseBuyMode,
        });
        if (!result) return;
        if (!best || result.finalValue > best.finalValue) {
          best = {
            params: {
              buyThreshold: candidateThreshold,
              deepDeployTiers: tierPreset.deepDeployTiers,
              tierLabel: tierPreset.label,
            },
            finalValue: result.finalValue,
          };
        }
      });
    });

    setOptimizerResult(best);
    setIsOptimizing(false);
  };

  return (
    <div className="bg-[var(--bg-app)] text-[var(--fg-default)]">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 dark:text-neutral-400">
            DCA Backtester
          </p>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            BTC Dynamic DCA vs Normal DCA
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Compare dollar-cost averaging, lump-sum, and blended strategies using Bitcoin price
            history and a risk-weighted DCA model.
          </p>
          <div className="rounded-2xl border border-amber-200/60 bg-amber-50/70 p-4 text-xs text-amber-900 dark:border-amber-300/30 dark:bg-amber-400/10 dark:text-amber-100">
            <p className="font-semibold uppercase tracking-[0.24em]">Beta notice</p>
            <p className="mt-2">
              This calculator is a proof of concept and should not be considered accurate until
              site admins have verified the data.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 text-sm text-neutral-600 dark:text-neutral-300">
            <p className="font-semibold text-neutral-900 dark:text-white">
              Use this DCA calculator to compare:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Standard DCA contributions on a fixed schedule.</li>
              <li>Lump-sum entry compared against DCA averages.</li>
              <li>Combination strategies that blend lump sum with staged DCA.</li>
            </ul>
            <p className="mt-3">
              The backtester highlights how risk-weighted sizing can shift buy amounts across
              different market regimes.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
              Current BTC Price (USD)
            </p>
            <p className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-white">
              {currentPrice ? `$${currentPrice.toLocaleString()}` : "Loading…"}
            </p>
          </div>
        </header>

        <section className="flex flex-col gap-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
          <div className="flex flex-wrap gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-2">
            {tabItems.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 min-w-[9rem] rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] transition",
                  activeTab === tab.id
                    ? "bg-brand text-white"
                    : "text-[var(--fg-muted)] hover:text-brand",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "strategy" ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Strategy settings define how much BTC you are attempting to accumulate and how the
                buys are paced over time.
              </p>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  CoinDesk Data Window
                </p>
                <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end">
                  <label className="flex flex-1 flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                    Start Date
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                    End Date
                    <input
                      type="date"
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                      className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void fetchHistorical(startDate, endDate)}
                    className="rounded-full bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70"
                  >
                    Fetch
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const todayDate = formatDateInput(new Date());
                      setStartDate("2021-01-04");
                      setEndDate(todayDate);
                      void fetchHistorical("2021-01-04", todayDate);
                    }}
                    className="rounded-full border border-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-brand transition hover:bg-brand/10"
                  >
                    Set dates: Jan 4 2021 → Today
                  </button>
                </div>
                {error ? (
                  <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>
                ) : null}
                <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                  {loading ? "Loading historical prices…" : rowsSummary}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  If CoinDesk is blocked by CORS, use a server proxy.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  Strategy Mode
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                    Strategy
                    <select
                      value={strategyMode}
                      onChange={(event) => setStrategyMode(event.target.value as "normal" | "threshold")}
                      className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                    >
                      <option value="normal">Normal DCA</option>
                      <option value="threshold">Threshold Accumulator</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                    Threshold Preset
                    <select
                      value={thresholdPreset}
                      onChange={(event) => {
                        const value = event.target.value as typeof thresholdPreset;
                        if (value === "custom") {
                          setThresholdPreset("custom");
                          return;
                        }
                        applyThresholdPreset(value);
                      }}
                      disabled={strategyMode !== "threshold"}
                      className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60 dark:text-white"
                    >
                      <option value="balanced">Balanced</option>
                      <option value="conservative">Conservative</option>
                      <option value="aggressive">Aggressive lows</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                </div>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Threshold Accumulator only deploys when risk is at or below your chosen
                  threshold.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  BTC Close (Sanity Check)
                </p>
                <div className="mt-3 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartRiskData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="price" stroke="#f59e0b" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                  aria-expanded={showAdvanced}
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                    Advanced: customize
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-brand">
                    {showAdvanced ? "Hide" : "Show"}
                  </span>
                </button>
                {showAdvanced ? (
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                          Risk Metric Settings
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                            MA Window (days)
                            <input
                              type="number"
                              min={1}
                              value={maWindowDays}
                              onChange={handleNumberChange(setMaWindowDays)}
                              className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                            Drawdown Window (days)
                            <input
                              type="number"
                              min={1}
                              value={drawdownWindowDays}
                              onChange={handleNumberChange(setDrawdownWindowDays)}
                              className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                            Vol Window (days)
                            <input
                              type="number"
                              min={1}
                              value={volWindowDays}
                              onChange={handleNumberChange(setVolWindowDays)}
                              className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                            MA Log Range
                            <input
                              type="number"
                              step="0.01"
                              min={0.01}
                              value={maLogRange}
                              onChange={handleNumberChange(setMaLogRange)}
                              className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                            Max Drawdown for 0 Risk
                            <input
                              type="number"
                              step="0.05"
                              min={0.05}
                              value={maxDrawdownForZeroRisk}
                              onChange={handleNumberChange(setMaxDrawdownForZeroRisk)}
                              className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                            Vol Target
                            <input
                              type="number"
                              step="0.01"
                              min={0.01}
                              value={volTarget}
                              onChange={handleNumberChange(setVolTarget)}
                              className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                          Component Weights
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                            Weight MA
                            <input
                              type="number"
                              step="0.05"
                              min={0}
                              value={weightMA}
                              onChange={handleNumberChange(setWeightMA)}
                              className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                            Weight Drawdown
                            <input
                              type="number"
                              step="0.05"
                              min={0}
                              value={weightDD}
                              onChange={handleNumberChange(setWeightDD)}
                              className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                            Weight Volatility
                            <input
                              type="number"
                              step="0.05"
                              min={0}
                              value={weightVOL}
                              onChange={handleNumberChange(setWeightVOL)}
                              className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                        Strategy Settings
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                          Schedule
                          <select
                            value={schedule}
                            onChange={(event) => setSchedule(event.target.value as Schedule)}
                            className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="biweekly">Biweekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                          Amount per Period (USD)
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={amountPerPeriod}
                            onChange={handleNumberChange(setAmountPerPeriod)}
                            className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                          Fee Rate (% per buy)
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={feeRate}
                            onChange={handleNumberChange(setFeeRate)}
                            className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                          Threshold Accumulator Settings
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => applyThresholdPreset("conservative")}
                            className="rounded-full border border-brand px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand transition hover:bg-brand/10"
                          >
                            Conservative
                          </button>
                          <button
                            type="button"
                            onClick={() => applyThresholdPreset("balanced")}
                            className="rounded-full border border-brand px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand transition hover:bg-brand/10"
                          >
                            Balanced
                          </button>
                          <button
                            type="button"
                            onClick={() => applyThresholdPreset("aggressive")}
                            className="rounded-full border border-brand px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand transition hover:bg-brand/10"
                          >
                            Aggressive lows
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4">
                        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                          Buy Threshold (risk ≤)
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={buyThreshold}
                            onChange={handleThresholdNumberChange(setBuyThreshold)}
                            className="accent-brand"
                          />
                          <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                            {buyThreshold.toFixed(2)}
                          </span>
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                            Base Buy Mode
                            <select
                              value={baseBuyMode}
                              onChange={(event) => {
                                setBaseBuyMode(event.target.value as "deposit" | "0");
                                setThresholdPreset("custom");
                              }}
                              className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                            >
                              <option value="0">Only deploy extra cash</option>
                              <option value="deposit">Include deposit as base buy</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                            Max Buy Cap (USD, optional)
                            <input
                              type="number"
                              min={0}
                              step="1"
                              value={maxBuyCap ?? ""}
                              onChange={handleMaxBuyCapChange}
                              className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                            />
                          </label>
                        </div>
                        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                            Deep Deploy Tiers
                          </p>
                          <div className="mt-3 overflow-x-auto">
                            <table className="min-w-[420px] w-full text-left text-xs">
                              <thead className="text-[0.6rem] uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                                <tr>
                                  <th className="px-2 py-1">Risk ≤</th>
                                  <th className="px-2 py-1">Deploy % of Cash</th>
                                </tr>
                              </thead>
                              <tbody>
                                {deepDeployTiers.map((tier, index) => (
                                  <tr key={`${tier.threshold}-${index}`} className="border-t border-[var(--border-subtle)]">
                                    <td className="px-2 py-2">
                                      <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step="0.01"
                                        value={tier.threshold}
                                        onChange={handleTierChange(index, "threshold")}
                                        className="w-24 rounded-lg border border-[var(--border-subtle)] bg-transparent px-2 py-1 text-xs font-semibold text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step="0.01"
                                        value={tier.deployPct}
                                        onChange={handleTierChange(index, "deployPct")}
                                        className="w-28 rounded-lg border border-[var(--border-subtle)] bg-transparent px-2 py-1 text-xs font-semibold text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                            The lowest risk tier that matches the day will trigger its deploy
                            percentage.
                          </p>
                        </div>
                      </div>
                    </div>
                    {isAdmin ? (
                      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                          Find better parameters
                        </p>
                        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                          Runs a coarse grid search over threshold settings to maximize final value.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={handleOptimizer}
                            disabled={isOptimizing || !riskRows.length}
                            className="rounded-full bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isOptimizing ? "Optimizing..." : "Find better parameters"}
                          </button>
                          {!riskRows.length ? (
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              Load data first to run optimization.
                            </span>
                          ) : null}
                        </div>
                        {optimizerResult ? (
                          <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                              Best parameters found
                            </p>
                            <div className="mt-3 grid gap-2 text-sm text-neutral-700 dark:text-neutral-300 sm:grid-cols-2">
                              <div>
                                <span className="font-semibold text-neutral-900 dark:text-white">
                                  Buy Threshold:
                                </span>{" "}
                                {optimizerResult.params.buyThreshold.toFixed(2)}
                              </div>
                              <div>
                                <span className="font-semibold text-neutral-900 dark:text-white">
                                  Tier Preset:
                                </span>{" "}
                                {optimizerResult.params.tierLabel}
                              </div>
                              <div>
                                <span className="font-semibold text-neutral-900 dark:text-white">
                                  Final Value:
                                </span>{" "}
                                {formatCurrency(optimizerResult.finalValue)}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                        Latest Risk Snapshot
                      </p>
                      {latestRiskRow ? (
                        <div className="mt-3 grid gap-2 text-sm text-neutral-700 dark:text-neutral-300 sm:grid-cols-2">
                          <div>
                            <span className="font-semibold text-neutral-900 dark:text-white">Risk:</span>{" "}
                            {latestRiskRow.risk?.toFixed(3)}
                          </div>
                          <div>
                            <span className="font-semibold text-neutral-900 dark:text-white">Date:</span>{" "}
                            {latestRiskRow.dateStr}
                          </div>
                          <div>
                            <span className="font-semibold text-neutral-900 dark:text-white">rMA:</span>{" "}
                            {latestRiskRow._riskParts?.rMA?.toFixed(3) ?? "—"}
                          </div>
                          <div>
                            <span className="font-semibold text-neutral-900 dark:text-white">rDD:</span>{" "}
                            {latestRiskRow._riskParts?.rDD?.toFixed(3) ?? "—"}
                          </div>
                          <div>
                            <span className="font-semibold text-neutral-900 dark:text-white">rVOL:</span>{" "}
                            {latestRiskRow._riskParts?.rVOL?.toFixed(3) ?? "—"}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                          Risk metrics will appear once enough data is available for the selected
                          windows.
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                        Risk Components
                      </p>
                      <div className="mt-3 h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartRiskData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} domain={[0, 1]} />
                            <Tooltip />
                            <Line type="monotone" dataKey="risk" stroke="#a855f7" dot={false} />
                            <Line type="monotone" dataKey="rMA" stroke="#22c55e" dot={false} />
                            <Line type="monotone" dataKey="rDD" stroke="#f97316" dot={false} />
                            <Line type="monotone" dataKey="rVOL" stroke="#0ea5e9" dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                    Open advanced settings to tune the risk metric, contribution schedule, and
                    threshold accumulator behavior.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === "results" ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Results summarize portfolio growth for normal DCA versus the Threshold Accumulator.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {backtestResults ? (
                  <>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                      Normal DCA Summary
                    </p>
                    <div className="mt-3 grid gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">Contributed:</span>{" "}
                          {formatCurrency(backtestResults.normal.contributed)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">Invested:</span>{" "}
                          {formatCurrency(backtestResults.normal.invested)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">Cash:</span>{" "}
                          {formatCurrency(backtestResults.normal.cash)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">BTC:</span>{" "}
                          {backtestResults.normal.btc.toFixed(6)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">Final Value:</span>{" "}
                          {formatCurrency(backtestResults.normal.finalValue)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">ROI:</span>{" "}
                          {formatPercent(backtestResults.normal.roi)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">
                            XIRR (money-weighted):
                          </span>{" "}
                          {formatPercent(backtestResults.normal.xirr)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">
                            CAGR (approx):
                          </span>{" "}
                          {formatPercent(
                            computeCagrApprox(
                              backtestResults.normal.finalValue,
                              backtestResults.normal.contributed,
                            ),
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">Max Drawdown:</span>{" "}
                          {formatPercent(backtestResults.normal.maxDrawdown)}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                        Threshold Accumulator Summary
                      </p>
                      <div className="mt-3 grid gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">Contributed:</span>{" "}
                          {formatCurrency(backtestResults.dynamic.contributed)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">Invested:</span>{" "}
                          {formatCurrency(backtestResults.dynamic.invested)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">Cash:</span>{" "}
                          {formatCurrency(backtestResults.dynamic.cash)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">BTC:</span>{" "}
                          {backtestResults.dynamic.btc.toFixed(6)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">Final Value:</span>{" "}
                          {formatCurrency(backtestResults.dynamic.finalValue)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">ROI:</span>{" "}
                          {formatPercent(backtestResults.dynamic.roi)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">
                            XIRR (money-weighted):
                          </span>{" "}
                          {formatPercent(backtestResults.dynamic.xirr)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">
                            CAGR (approx):
                          </span>{" "}
                          {formatPercent(
                            computeCagrApprox(
                              backtestResults.dynamic.finalValue,
                              backtestResults.dynamic.contributed,
                            ),
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">
                            Outperformance vs DCA:
                          </span>{" "}
                          {formatPercent(outperformance)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">Max Drawdown:</span>{" "}
                          {formatPercent(backtestResults.dynamic.maxDrawdown)}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-neutral-600 dark:text-neutral-300">
                    Backtest results will appear after historical data loads.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  Portfolio Value Over Time
                </p>
                <div className="mt-3 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={portfolioSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="normalValue" stroke="#22c55e" dot={false} />
                      <Line type="monotone" dataKey="dynamicValue" stroke="#a855f7" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  ROI-to-Date
                </p>
                <div className="mt-3 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={portfolioSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={[-1, "auto"]} />
                      <Tooltip />
                      <Line type="monotone" dataKey="normalROI" stroke="#22c55e" dot={false} />
                      <Line type="monotone" dataKey="dynamicROI" stroke="#a855f7" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4 text-sm text-neutral-600 dark:text-neutral-300">
                <p className="font-semibold text-neutral-900 dark:text-white">
                  Risk-Adjusted XIRR minus Normal XIRR = {xirrDiffLabel}
                </p>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Tuning thresholds to maximize a specific historical window may overfit.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                    Pros & Cons
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowProsConsMore((prev) => !prev)}
                    className="rounded-full border border-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-brand transition hover:bg-brand/10"
                  >
                    {showProsConsMore ? "Show less" : "Show more"}
                  </button>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                      Normal DCA — Pros
                    </p>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
                      <li>Simple, consistent, easy to stick to.</li>
                      <li>Always gets market exposure (no sitting in cash).</li>
                      <li>No dependence on a risk model or parameters.</li>
                    </ul>
                    {showProsConsMore ? (
                      <>
                        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                          Normal DCA — Cons
                        </p>
                        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
                          <li>Buys equally in high-risk (overextended) conditions.</li>
                          <li>Doesn’t concentrate buying power into deep drawdowns.</li>
                          <li>Can experience larger drawdowns depending on entry period.</li>
                        </ul>
                      </>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                      Risk-Adjusted DCA — Pros
                    </p>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
                      <li>Systematically reduces/pauses buying when risk is high.</li>
                      <li>Can concentrate buys when risk is low (especially with cash deploy).</li>
                      <li>Can reduce drawdowns and improve cost basis if the metric aligns.</li>
                    </ul>
                    {showProsConsMore ? (
                      <>
                        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                          Risk-Adjusted DCA — Cons
                        </p>
                        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
                          <li>Model risk: depends on risk metric and parameters.</li>
                          <li>Can underperform if it stays in cash during strong uptrends.</li>
                          <li>More complex to explain and audit.</li>
                        </ul>
                      </>
                    ) : null}
                  </div>
                </div>
                <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
                  Backtests can overfit. Optimizing parameters on the same period may not
                  generalize.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                    Chart Details
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowResultsCharts((prev) => !prev)}
                    className="rounded-full border border-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-brand transition hover:bg-brand/10"
                  >
                    {showResultsCharts ? "Hide details" : "Show details"}
                  </button>
                </div>
                {showResultsCharts ? (
                  <div className="mt-4 grid gap-4">
                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                        Buy Size Over Time
                      </p>
                      <div className="mt-3 h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={portfolioSeries}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Line type="monotone" dataKey="normalBuy" stroke="#22c55e" dot={false} />
                            <Line
                              type="monotone"
                              dataKey="dynamicBuy"
                              stroke="#a855f7"
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                        Risk Score Over Time
                      </p>
                      <div className="mt-3 h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={portfolioSeries}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} domain={[0, 1]} />
                            <Tooltip />
                            <Line type="monotone" dataKey="risk" stroke="#f97316" dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                    Toggle details to review buy sizing and risk charts.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                    Period-by-Period Audit
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowResultsTable((prev) => !prev)}
                    className="rounded-full border border-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-brand transition hover:bg-brand/10"
                  >
                    {showResultsTable ? "Hide details" : "Show details"}
                  </button>
                </div>
                {showResultsTable ? (
                  <>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-neutral-600 dark:text-neutral-300">
                        The audit table gives a line-by-line view of contributions so you can verify
                        each BTC accumulation step.
                      </p>
                      <button
                        type="button"
                        onClick={handleExportCsv}
                        className="rounded-full border border-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-brand transition hover:bg-brand/10"
                      >
                        Download CSV
                      </button>
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--border-subtle)]">
                      <table className="min-w-[900px] w-full text-left text-xs">
                        <thead className="bg-[var(--bg-app)]/60 text-[0.6rem] uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Price</th>
                            <th className="px-3 py-2">Risk</th>
                            <th className="px-3 py-2">Extra Deploy %</th>
                            <th className="px-3 py-2">Tier</th>
                            <th className="px-3 py-2">Deposit</th>
                            <th className="px-3 py-2">Buy Normal</th>
                            <th className="px-3 py-2">Buy Risk</th>
                            <th className="px-3 py-2">BTC Normal</th>
                            <th className="px-3 py-2">BTC Risk</th>
                            <th className="px-3 py-2">Cash Normal</th>
                            <th className="px-3 py-2">Cash Risk</th>
                            <th className="px-3 py-2">Value Normal</th>
                            <th className="px-3 py-2">Value Risk</th>
                          </tr>
                        </thead>
                        <tbody>
                          {backtestResults?.normal.history.map((normalPoint, index) => {
                            const dynamicPoint = backtestResults.dynamic.history[index];
                            const prevNormal =
                              index > 0 ? backtestResults.normal.history[index - 1] : null;
                            const deposit = prevNormal
                              ? normalPoint.contributed - prevNormal.contributed
                              : normalPoint.contributed;
                            return (
                              <tr
                                key={normalPoint.dateStr}
                                className="border-t border-[var(--border-subtle)]"
                              >
                                <td className="px-3 py-2">{normalPoint.dateStr}</td>
                                <td className="px-3 py-2">{formatCurrency(normalPoint.price)}</td>
                                <td className="px-3 py-2">
                                  {normalPoint.risk?.toFixed(3) ?? "—"}
                                </td>
                                <td className="px-3 py-2">
                                  {dynamicPoint
                                    ? formatPercent(dynamicPoint.extraDeployPct, 1)
                                    : "—"}
                                </td>
                                <td className="px-3 py-2">{dynamicPoint?.tierLabel ?? "—"}</td>
                                <td className="px-3 py-2">{formatCurrency(deposit)}</td>
                                <td className="px-3 py-2">{formatCurrency(normalPoint.buy)}</td>
                                <td className="px-3 py-2">
                                  {formatCurrency(dynamicPoint?.buy)}
                                </td>
                                <td className="px-3 py-2">{normalPoint.btc.toFixed(6)}</td>
                                <td className="px-3 py-2">
                                  {dynamicPoint?.btc.toFixed(6) ?? "—"}
                                </td>
                                <td className="px-3 py-2">{formatCurrency(normalPoint.cash)}</td>
                                <td className="px-3 py-2">
                                  {formatCurrency(dynamicPoint?.cash)}
                                </td>
                                <td className="px-3 py-2">{formatCurrency(normalPoint.value)}</td>
                                <td className="px-3 py-2">
                                  {formatCurrency(dynamicPoint?.value)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                    Audit details stay collapsed on mobile to keep results focused.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === "how" ? (
            <div className="flex flex-col gap-4 text-sm text-neutral-600 dark:text-neutral-300">
              <p>
                This section explains why different buy methods matter so you can build an
                accumulation plan that fits your BTC goals.
              </p>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  {t("dca.tabs.howToBuySubtitle", {
                    defaultValue: "DCA vs lump sum and other strategies",
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  Data source
                </p>
                <p className="mt-2">
                  Historical BTC prices are pulled from CoinDesk for the selected date range. The
                  model uses close prices to simulate each scheduled contribution.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  Risk metric in plain language
                </p>
                <p className="mt-2">
                  The risk score blends three price-only signals: distance from a long-term moving
                  average, drawdown from recent highs, and realized volatility. Each signal is
                  normalized to a 0–1 range and combined into a single risk score.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  Fairness model
                </p>
                <p className="mt-2">
                  Both strategies receive the same contribution schedule and fees. The dynamic
                  strategy only changes how much cash is deployed based on the risk curve while
                  any unused cash carries forward. This keeps comparisons apples-to-apples.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  Threshold Accumulator behavior
                </p>
                <p className="mt-2">
                  When risk is above the buy threshold, the strategy saves deposits as cash. When
                  risk drops below the threshold, it deploys cash according to the deepest matching
                  tier, allowing more aggressive buys in very low-risk regimes.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  Why DCA at all (normal)
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Reduces the pressure of timing a single entry.</li>
                  <li>Creates a systematic habit rather than one-off decisions.</li>
                  <li>Helps avoid “buy now or wait for a dip?” paralysis.</li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  Why risk-weighted DCA
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Keeps the schedule but adjusts sizing using a rule.</li>
                  <li>Buys more in lower-risk regimes and less or pauses in higher-risk regimes.</li>
                  <li>Remains systematic rather than discretionary.</li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  DCA vs. lump-sum buy
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>A lump sum is one big timing decision.</li>
                  <li>DCA spreads entry over time and reduces timing stress.</li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  Common hybrid approaches
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Tranche the lump sum (a “lump-sum DCA” over N periods).</li>
                  <li>Deploy a partial lump sum now and DCA the remainder.</li>
                  <li>Keep a small reserve with predefined rules while running a regular DCA.</li>
                </ul>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Educational only. This is not financial advice.
              </p>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
