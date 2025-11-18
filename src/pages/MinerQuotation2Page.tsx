import React, { useEffect, useState } from "react";

const MINER_PROFILES = {
  s21: {
    modelLabel: "Asic Antminer S21 Pro 245TH",
    unitHashrateTh: 245,
    unitPowerKw: 3.51,
  },
} as const;

function calculateBtcPerThPerDay(
  difficulty: number,
  blockRewardBtc: number,
): number {
  const hashesPerSecondPerTh = 1e12;
  const blocksPerDay = 144;
  const denominator = difficulty * 2 ** 32;

  if (!denominator) return 0;

  const btcPerDayPerTh =
    (hashesPerSecondPerTh / denominator) * blockRewardBtc * blocksPerDay;

  return btcPerDayPerTh;
}

interface QuoteState {
  units: number;
  electricityPricePerKwhUsd: number;
  btcPriceUsd: number;
  minerPricePerUnitUsd: number;
  logisticsPerUnitUsd: number;
  taxesPerUnitUsd: number;
  model: "s21" | "custom";
  unitHashrateTh: number;
  unitPowerKw: number;
}

const defaultQuoteState: QuoteState = {
  units: 20,
  electricityPricePerKwhUsd: 0.008,
  btcPriceUsd: 60000,
  minerPricePerUnitUsd: 3860,
  logisticsPerUnitUsd: 359,
  taxesPerUnitUsd: 368.7,
  model: "s21",
  unitHashrateTh: MINER_PROFILES.s21.unitHashrateTh,
  unitPowerKw: MINER_PROFILES.s21.unitPowerKw,
};

function getInitialQuoteState(): QuoteState {
  const params = new URLSearchParams(window.location.search);
  const parseNumber = (key: string, fallback: number) => {
    const value = params.get(key);
    if (value === null) return fallback;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const modelParam = params.get("model");
  const model: QuoteState["model"] =
    modelParam === "custom" || modelParam === "s21" ? modelParam : "s21";

  const baseState: QuoteState = {
    units: parseNumber("units", defaultQuoteState.units),
    electricityPricePerKwhUsd: parseNumber(
      "elec",
      defaultQuoteState.electricityPricePerKwhUsd,
    ),
    btcPriceUsd: parseNumber("btcPriceUsd", defaultQuoteState.btcPriceUsd),
    minerPricePerUnitUsd: parseNumber(
      "minerPrice",
      defaultQuoteState.minerPricePerUnitUsd,
    ),
    logisticsPerUnitUsd: parseNumber(
      "logistics",
      defaultQuoteState.logisticsPerUnitUsd,
    ),
    taxesPerUnitUsd: parseNumber("taxes", defaultQuoteState.taxesPerUnitUsd),
    model,
    unitHashrateTh: defaultQuoteState.unitHashrateTh,
    unitPowerKw: defaultQuoteState.unitPowerKw,
  };

  if (model === "s21") {
    return {
      ...baseState,
      unitHashrateTh: MINER_PROFILES.s21.unitHashrateTh,
      unitPowerKw: MINER_PROFILES.s21.unitPowerKw,
    };
  }

  return baseState;
}

function getInitialAutoBtcPrice(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("autoBtcPrice") === "false" ? false : true;
}

export function MinerQuotation2Page() {
  const [quote, setQuote] = useState<QuoteState>(() => getInitialQuoteState());
  const [autoBtcPrice, setAutoBtcPrice] = useState<boolean>(
    () => getInitialAutoBtcPrice(),
  );
  const [btcPerThPerDay, setBtcPerThPerDay] = useState<number>(0.0000005);

  const issueDate = new Date().toLocaleDateString();
  const totalHashrateTh = quote.unitHashrateTh * quote.units;
  const totalPowerKw = quote.unitPowerKw * quote.units;
  const dailyBtc = totalHashrateTh * btcPerThPerDay;
  const weeklyBtc = dailyBtc * 7;
  const monthlyBtc = dailyBtc * 30;
  const dailyRevenueUsd = dailyBtc * quote.btcPriceUsd;
  const weeklyRevenueUsd = weeklyBtc * quote.btcPriceUsd;
  const monthlyRevenueUsd = monthlyBtc * quote.btcPriceUsd;
  const dailyElecUsd = totalPowerKw * 24 * quote.electricityPricePerKwhUsd;
  const weeklyElecUsd = dailyElecUsd * 7;
  const monthlyElecUsd = dailyElecUsd * 30;
  const dailyNetUsd = dailyRevenueUsd - dailyElecUsd;
  const weeklyNetUsd = weeklyRevenueUsd - weeklyElecUsd;
  const monthlyNetUsd = monthlyRevenueUsd - monthlyElecUsd;
  const minerCapexUsd = quote.minerPricePerUnitUsd * quote.units;
  const logisticsUsd = quote.logisticsPerUnitUsd * quote.units;
  const taxesUsd = quote.taxesPerUnitUsd * quote.units;
  const totalCapexUsd = minerCapexUsd + logisticsUsd + taxesUsd;
  const totalPerUnit =
    quote.minerPricePerUnitUsd + quote.logisticsPerUnitUsd + quote.taxesPerUnitUsd;
  const usdToBtc = (usd: number) => (quote.btcPriceUsd > 0 ? usd / quote.btcPriceUsd : 0);
  const paybackMonths = monthlyNetUsd > 0 && totalCapexUsd > 0
    ? totalCapexUsd / monthlyNetUsd
    : null;
  const annualRoiPercent = monthlyNetUsd > 0 && totalCapexUsd > 0
    ? (12 * monthlyNetUsd * 100) / totalCapexUsd
    : null;

  const handleNumberChange = <K extends keyof QuoteState>(key: K) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value.trim();
      const parsed = value === "" ? 0 : Number.parseFloat(value);
      setQuote((prev) => ({
        ...prev,
        [key]: Number.isNaN(parsed) ? 0 : parsed,
      }));
    };

  const handleBtcPriceChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setAutoBtcPrice(false);
    handleNumberChange("btcPriceUsd")(event);
  };

  const handleModelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextModel = event.target.value === "custom" ? "custom" : "s21";
    setQuote((prev) => {
      if (nextModel === "s21") {
        return {
          ...prev,
          model: nextModel,
          unitHashrateTh: MINER_PROFILES.s21.unitHashrateTh,
          unitPowerKw: MINER_PROFILES.s21.unitPowerKw,
        };
      }
      return { ...prev, model: nextModel };
    });
  };

  useEffect(() => {
    if (!autoBtcPrice) return;

    let isMounted = true;

    const fetchPrice = async () => {
      try {
        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          bitcoin?: { usd?: number };
        };
        const nextPrice = data.bitcoin?.usd;
        if (Number.isFinite(nextPrice) && isMounted) {
          setQuote((prev) => ({ ...prev, btcPriceUsd: nextPrice as number }));
        }
      } catch (error) {
        // ignore network errors and keep existing price
      }
    };

    fetchPrice();

    return () => {
      isMounted = false;
    };
  }, [autoBtcPrice]);

  useEffect(() => {
    let isMounted = true;

    const fetchDifficulty = async () => {
      try {
        const [difficultyRes, rewardRes] = await Promise.all([
          fetch("https://api.blockchain.info/q/getdifficulty"),
          fetch("https://api.blockchain.info/q/bcperblock"),
        ]);

        if (!difficultyRes.ok || !rewardRes.ok) return;

        const difficultyText = await difficultyRes.text();
        const rewardText = await rewardRes.text();
        const difficulty = Number.parseFloat(difficultyText);
        const blockRewardBtc = Number.parseFloat(rewardText);

        if (!Number.isFinite(difficulty) || !Number.isFinite(blockRewardBtc)) {
          return;
        }

        const nextRate = calculateBtcPerThPerDay(difficulty, blockRewardBtc);
        if (isMounted && Number.isFinite(nextRate)) {
          setBtcPerThPerDay(nextRate);
        }
      } catch (error) {
        // ignore network errors and retain placeholder rate
      }
    };

    fetchDifficulty();

    return () => {
      isMounted = false;
    };
  }, []);

  const formatNumber = (value: number, decimals = 2) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  const profitability = [
    {
      label: "Daily",
      rows: [
        {
          title: "Gross Revenue",
          btc: `${formatNumber(dailyBtc, 8)} BTC`,
          usd: `$ ${formatNumber(dailyRevenueUsd)}`,
        },
        {
          title: "Electricity Cost",
          btc: `${formatNumber(usdToBtc(dailyElecUsd), 8)} BTC`,
          usd: `$ ${formatNumber(dailyElecUsd)}`,
        },
        {
          title: "Net Profit",
          btc: `${formatNumber(usdToBtc(dailyNetUsd), 8)} BTC`,
          usd: `$ ${formatNumber(dailyNetUsd)}`,
        },
      ],
    },
    {
      label: "Weekly",
      rows: [
        {
          title: "Gross Revenue",
          btc: `${formatNumber(weeklyBtc, 8)} BTC`,
          usd: `$ ${formatNumber(weeklyRevenueUsd)}`,
        },
        {
          title: "Electricity Cost",
          btc: `${formatNumber(usdToBtc(weeklyElecUsd), 8)} BTC`,
          usd: `$ ${formatNumber(weeklyElecUsd)}`,
        },
        {
          title: "Net Profit",
          btc: `${formatNumber(usdToBtc(weeklyNetUsd), 8)} BTC`,
          usd: `$ ${formatNumber(weeklyNetUsd)}`,
        },
      ],
    },
    {
      label: "Monthly",
      rows: [
        {
          title: "Gross Revenue",
          btc: `${formatNumber(monthlyBtc, 8)} BTC`,
          usd: `$ ${formatNumber(monthlyRevenueUsd)}`,
        },
        {
          title: "Electricity Cost",
          btc: `${formatNumber(usdToBtc(monthlyElecUsd), 8)} BTC`,
          usd: `$ ${formatNumber(monthlyElecUsd)}`,
        },
        {
          title: "Net Profit",
          btc: `${formatNumber(usdToBtc(monthlyNetUsd), 8)} BTC`,
          usd: `$ ${formatNumber(monthlyNetUsd)}`,
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 py-12 px-4">
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-amber-300 mb-2">
                Professional BTC Mining Quotation
              </p>
              <h1 className="text-3xl font-bold">
                Investment Analysis and Projected Profitability
              </h1>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label className="text-gray-300" htmlFor="model-select">
                Miner Model:
              </label>
              <select
                id="model-select"
                value={quote.model}
                onChange={handleModelChange}
                className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
              >
                <option value="s21">S21</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-amber-200">General Information</h2>
            <dl className="space-y-2 text-sm sm:text-base">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Equipment Model</dt>
                <dd className="font-medium">
                  {quote.model === "s21"
                    ? MINER_PROFILES.s21.modelLabel
                    : "Custom ASIC Miner"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Issue Date</dt>
                <dd className="font-medium">{issueDate}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-amber-200">Technical Specifications</h2>
            <dl className="space-y-2 text-sm sm:text-base">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Unit Power Consumption</dt>
                <dd className="font-medium">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={quote.unitPowerKw}
                    onChange={handleNumberChange("unitPowerKw")}
                    className="w-24 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                  <span className="ml-2 text-gray-400 text-xs">kW</span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Hashrate</dt>
                <dd className="font-medium">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={quote.unitHashrateTh}
                    onChange={handleNumberChange("unitHashrateTh")}
                    className="w-24 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                  <span className="ml-2 text-gray-400 text-xs">TH/s</span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Efficiency</dt>
                <dd className="font-medium text-gray-500">—</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Total Units</dt>
                <dd className="font-medium">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={quote.units}
                    onChange={handleNumberChange("units")}
                    className="w-24 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Total Power Consumption</dt>
                <dd className="font-medium">{formatNumber(totalPowerKw)} kW/h</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Electricity Cost</dt>
                <dd className="font-medium">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    value={quote.electricityPricePerKwhUsd}
                    onChange={handleNumberChange("electricityPricePerKwhUsd")}
                    className="w-28 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                  <span className="ml-2 text-gray-400 text-xs">USD/kWh</span>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-amber-200">Profitability Projection</h2>
            <p className="text-sm text-gray-400">Projected earnings with current market conditions</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {profitability.map((bucket) => (
              <aside
                key={bucket.label}
                className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-3 shadow"
              >
                <h3 className="text-lg font-semibold text-amber-300">{bucket.label}</h3>
                <dl className="space-y-3 text-sm sm:text-base">
                  {bucket.rows.map((row) => (
                    <div key={row.title} className="border-t border-gray-800 pt-3 first:border-t-0 first:pt-0">
                      <dt className="text-gray-400">{row.title}</dt>
                      <dd className="flex justify-between font-medium">
                        <span>{row.btc}</span>
                        <span className="text-right text-gray-200">{row.usd}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </aside>
            ))}
          </div>
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-amber-200">Investment Structure</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm sm:text-base">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="py-2">Item</th>
                  <th className="py-2">Unit Price</th>
                  <th className="py-2">Quantity</th>
                  <th className="py-2">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                <tr>
                  <td className="py-3 font-medium">Mining Equipment</td>
                  <td className="py-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={quote.minerPricePerUnitUsd}
                      onChange={handleNumberChange("minerPricePerUnitUsd")}
                      className="w-28 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
                    />
                  </td>
                  <td className="py-3">{quote.units}</td>
                  <td className="py-3">$ {formatNumber(minerCapexUsd)}</td>
                </tr>
                <tr>
                  <td className="py-3 font-medium">International Logistics</td>
                  <td className="py-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={quote.logisticsPerUnitUsd}
                      onChange={handleNumberChange("logisticsPerUnitUsd")}
                      className="w-28 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
                    />
                  </td>
                  <td className="py-3">{quote.units}</td>
                  <td className="py-3">$ {formatNumber(logisticsUsd)}</td>
                </tr>
                <tr>
                  <td className="py-3 font-medium">Taxes and Customs Duties</td>
                  <td className="py-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={quote.taxesPerUnitUsd}
                      onChange={handleNumberChange("taxesPerUnitUsd")}
                      className="w-28 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
                    />
                  </td>
                  <td className="py-3">{quote.units}</td>
                  <td className="py-3">$ {formatNumber(taxesUsd)}</td>
                </tr>
                <tr className="font-semibold text-amber-200">
                  <td className="py-3">Total</td>
                  <td className="py-3">$ {formatNumber(totalPerUnit)}</td>
                  <td className="py-3">{quote.units}</td>
                  <td className="py-3">$ {formatNumber(totalCapexUsd)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <aside className="bg-gray-900 border border-amber-300/40 rounded-xl p-6 shadow-lg space-y-3">
          <p className="text-sm uppercase tracking-[0.25em] text-amber-300">Total Investment Required</p>
          <h3 className="text-3xl font-bold">USD $ {formatNumber(totalCapexUsd)}</h3>
          <p className="text-lg text-gray-200">
            Estimated Payback Period: {paybackMonths ? `${formatNumber(paybackMonths)} months` : "–"}
          </p>
          <p className="text-lg text-gray-200">
            Projected Annual ROI: {annualRoiPercent ? `${formatNumber(annualRoiPercent)} %` : "–"}
          </p>
          <div className="pt-2 border-t border-gray-800 text-sm text-gray-300 space-y-2">
            <div className="flex justify-between items-center gap-3">
              <span className="text-gray-400">Market BTC Price (USD)</span>
              <input
                type="number"
                inputMode="decimal"
                value={quote.btcPriceUsd}
                onChange={handleBtcPriceChange}
                className="w-32 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
              />
            </div>
            <label className="flex items-center justify-end gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={autoBtcPrice}
                onChange={(event) => setAutoBtcPrice(event.target.checked)}
                className="h-4 w-4 rounded border-gray-700 bg-gray-950 text-amber-300 focus:ring-amber-300"
              />
              Auto-update BTC price from API
            </label>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            * Calculations are based on current market conditions and may vary depending on mining
            difficulty, Bitcoin price, and operating costs.
          </p>
        </aside>
      </div>
    </div>
  );
}

export default MinerQuotation2Page;
