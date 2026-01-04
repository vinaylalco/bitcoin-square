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

const COINDESK_CURRENT_URL = "https://api.coindesk.com/v1/bpi/currentprice/USD.json";
const COINDESK_HISTORICAL_URL = "https://api.coindesk.com/v1/bpi/historical/close.json";
const HISTORICAL_CACHE_KEY = "admin-dca-backtester-historical-cache";
const SETTINGS_CACHE_KEY = "admin-dca-backtester-settings";

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

type RiskBand = {
  min: number;
  max: number;
  multiplier: number;
};

type StrategyPoint = {
  dateStr: string;
  date: Date;
  price: number;
  risk: number | null;
  multiplier: number;
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
  riskBandInput: string;
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

function parseHistoricalRows(payload: { bpi?: Record<string, number> }): HistoricalRow[] {
  const entries = Object.entries(payload.bpi ?? {});
  return entries
    .map(([dateStr, price]) => ({
      dateStr,
      date: new Date(`${dateStr}T00:00:00Z`),
      price,
    }))
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

export default function AdminDcaBacktesterPage() {
  const today = useMemo(() => new Date(), []);
  const defaultEnd = formatDateInput(today);
  const defaultStart = formatDateInput(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30),
  );

  // QA checklist:
  // - Non-admin cannot access route (redirect/403)
  // - Non-admin never sees the menu item
  // - Admin sees menu item + can access route
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
  const [riskBandInput, setRiskBandInput] = useState(
    ["0.2,0.5", "0.4,0.8", "0.6,1", "0.8,1.2", "1,1.5"].join("\n"),
  );
  const [activeTab, setActiveTab] = useState("data");

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
      if (parsed.startDate) setStartDate(parsed.startDate);
      if (parsed.endDate) setEndDate(parsed.endDate);
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
      if (parsed.riskBandInput) setRiskBandInput(parsed.riskBandInput);
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
      riskBandInput,
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
    riskBandInput,
  ]);

  const handleNumberChange =
    (setter: (value: number) => void) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      if (Number.isFinite(next)) {
        setter(next);
      }
    };

  const riskBands = useMemo<RiskBand[]>(() => {
    const lines = riskBandInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const parsed = lines
      .map((line) => {
        const [maxRiskRaw, multiplierRaw] = line.split(",").map((value) => value.trim());
        const maxRisk = Number(maxRiskRaw);
        const multiplier = Number(multiplierRaw);
        if (!Number.isFinite(maxRisk) || !Number.isFinite(multiplier)) {
          return null;
        }
        return { maxRisk, multiplier };
      })
      .filter((band): band is { maxRisk: number; multiplier: number } => band !== null)
      .sort((a, b) => a.maxRisk - b.maxRisk);

    let min = 0;
    return parsed.map((band, index) => {
      const next = {
        min,
        max: index === parsed.length - 1 ? Math.min(1, band.maxRisk) : band.maxRisk,
        multiplier: band.multiplier,
      };
      min = band.maxRisk;
      return next;
    });
  }, [riskBandInput]);


  useEffect(() => {
    let isMounted = true;
    const loadCurrent = async () => {
      try {
        const response = await fetch(COINDESK_CURRENT_URL);
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
      const url = `${COINDESK_HISTORICAL_URL}?start=${start}&end=${end}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`CoinDesk historical data failed (${response.status}).`);
      }
      const data = (await response.json()) as { bpi?: Record<string, number> };
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
    const bandForRisk = (risk: number | null) => {
      if (risk == null) return 1;
      const sorted = [...riskBands].sort((a, b) => a.min - b.min);
      for (let i = 0; i < sorted.length; i += 1) {
        const band = sorted[i];
        const isLast = i === sorted.length - 1;
        if (risk >= band.min && (risk < band.max || (isLast && risk <= band.max))) {
          return band.multiplier;
        }
      }
      return 1;
    };

    const runStrategy = (mode: "normal" | "dynamic"): StrategyResult => {
      let cash = 0;
      let btc = 0;
      let contributed = 0;
      let invested = 0;
      const history: StrategyPoint[] = [];
      const cashflows: Array<{ date: Date; amount: number }> = [];

      riskRows.forEach((row) => {
        const scheduleHit = isScheduleHit(row.date, start, schedule);
        let multiplier = 1;
        let buy = 0;
        let fee = 0;

        if (scheduleHit) {
          cash += safeAmount;
          contributed += safeAmount;
          cashflows.push({ date: row.date, amount: -safeAmount });

          if (mode === "dynamic") {
            multiplier = bandForRisk(row.risk ?? null);
          }

          const targetBuy = safeAmount * multiplier;
          buy = Math.min(cash, Math.max(0, targetBuy));
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
          multiplier,
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
      dynamic: runStrategy("dynamic"),
    };
  }, [amountPerPeriod, feeRate, riskBands, riskRows, schedule]);

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

  const previewRiskValues = [0.05, 0.25, 0.45, 0.65, 0.85];
  const previewBands = previewRiskValues.map((risk) => {
    const band = riskBands.find(
      (entry, index) =>
        risk >= entry.min && (risk < entry.max || index === riskBands.length - 1),
    );
    return { risk, multiplier: band?.multiplier ?? 1 };
  });

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
      "multiplier",
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
        dynamicPoint?.multiplier ?? "",
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
    { id: "data", label: "Data" },
    { id: "risk", label: "Risk Metric" },
    { id: "strategy", label: "Strategy" },
    { id: "charts", label: "Charts" },
    { id: "table", label: "Table" },
    { id: "why", label: "Why" },
  ];

  return (
    <div className="bg-[var(--bg-app)] text-[var(--fg-default)]">
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8">
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
          <div className="flex flex-wrap gap-2">
            {tabItems.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] transition ${
                  activeTab === tab.id
                    ? "border-brand bg-brand text-white"
                    : "border-[var(--border-subtle)] text-[var(--fg-muted)] hover:border-brand hover:text-brand"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "data" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
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
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                  <p className="font-semibold">Unable to load CoinDesk data.</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.24em]">{error}</p>
                </div>
              ) : null}

              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {loading ? "Loading historical prices…" : rowsSummary}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                If CoinDesk is blocked by CORS, use a server proxy.
              </p>

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
            </div>
          ) : null}

          {activeTab === "risk" ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                The risk metric blends moving-average distance, drawdown, and realized volatility
                into a single 0–1 score. Use the controls below to adjust windows, normalization
                ranges, and weights.
              </p>
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
                    Risk metrics will appear once enough data is available for the selected windows.
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
          ) : null}

          {activeTab === "strategy" ? (
            <div className="flex flex-col gap-4">
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
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  Risk Bands (maxRisk, multiplier)
                </p>
                <textarea
                  value={riskBandInput}
                  onChange={(event) => setRiskBandInput(event.target.value)}
                  rows={6}
                  className="mt-3 w-full rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-white"
                />
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Each line should be: maxRisk,multiplier. Risk bands are inferred from 0 to the
                  max risk value.
                </p>
                <div className="mt-3 grid gap-2 text-sm text-neutral-700 dark:text-neutral-300 sm:grid-cols-2">
                  {previewBands.map((preview) => (
                    <div key={preview.risk} className="flex items-center justify-between">
                      <span>Risk {preview.risk.toFixed(2)}</span>
                      <span className="font-semibold text-neutral-900 dark:text-white">
                        ×{preview.multiplier.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "charts" ? (
            <div className="flex flex-col gap-4">
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
                          <span className="font-semibold text-neutral-900 dark:text-white">XIRR:</span>{" "}
                          {formatPercent(backtestResults.normal.xirr)}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-white">Max Drawdown:</span>{" "}
                          {formatPercent(backtestResults.normal.maxDrawdown)}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/60 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                        Dynamic DCA Summary
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
                          <span className="font-semibold text-neutral-900 dark:text-white">XIRR:</span>{" "}
                          {formatPercent(backtestResults.dynamic.xirr)}
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
                      <Line type="monotone" dataKey="dynamicBuy" stroke="#a855f7" dot={false} />
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
          ) : null}

          {activeTab === "table" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                  Period-by-Period Audit
                </p>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="rounded-full border border-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-brand transition hover:bg-brand/10"
                >
                  Download CSV
                </button>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)]">
                <table className="min-w-[900px] w-full text-left text-xs">
                  <thead className="bg-[var(--bg-app)]/60 text-[0.6rem] uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Price</th>
                      <th className="px-3 py-2">Risk</th>
                      <th className="px-3 py-2">Multiplier</th>
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
                      const prevNormal = index > 0 ? backtestResults.normal.history[index - 1] : null;
                      const deposit = prevNormal
                        ? normalPoint.contributed - prevNormal.contributed
                        : normalPoint.contributed;
                      return (
                        <tr key={normalPoint.dateStr} className="border-t border-[var(--border-subtle)]">
                          <td className="px-3 py-2">{normalPoint.dateStr}</td>
                          <td className="px-3 py-2">{formatCurrency(normalPoint.price)}</td>
                          <td className="px-3 py-2">{normalPoint.risk?.toFixed(3) ?? "—"}</td>
                          <td className="px-3 py-2">{dynamicPoint?.multiplier?.toFixed(2) ?? "—"}</td>
                          <td className="px-3 py-2">{formatCurrency(deposit)}</td>
                          <td className="px-3 py-2">{formatCurrency(normalPoint.buy)}</td>
                          <td className="px-3 py-2">{formatCurrency(dynamicPoint?.buy)}</td>
                          <td className="px-3 py-2">{normalPoint.btc.toFixed(6)}</td>
                          <td className="px-3 py-2">{dynamicPoint?.btc.toFixed(6) ?? "—"}</td>
                          <td className="px-3 py-2">{formatCurrency(normalPoint.cash)}</td>
                          <td className="px-3 py-2">{formatCurrency(dynamicPoint?.cash)}</td>
                          <td className="px-3 py-2">{formatCurrency(normalPoint.value)}</td>
                          <td className="px-3 py-2">{formatCurrency(dynamicPoint?.value)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {activeTab === "why" ? (
            <div className="flex flex-col gap-4 text-sm text-neutral-600 dark:text-neutral-300">
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
                  <li>
                    Keep a small reserve with predefined rules while running a regular DCA.
                  </li>
                </ul>
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
