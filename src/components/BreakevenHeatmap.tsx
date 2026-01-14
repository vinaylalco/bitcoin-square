import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { InfoModal } from "./InfoModal";

interface BreakevenHeatmapProps {
  dailyBtc: number;
  totalPowerKw: number;
}

interface HeatmapCell {
  btcPrice: number;
  elecPrice: number;
  dailyRevenueUsd: number;
  dailyElecUsd: number;
  dailyNetUsd: number;
}

const formatCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function BreakevenHeatmap({
  dailyBtc,
  totalPowerKw,
}: BreakevenHeatmapProps) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const btcPrices = useMemo(() => {
    const values: number[] = [];
    for (let price = 20000; price <= 200000; price += 10000) {
      values.push(price);
    }
    return values;
  }, []);

  const elecPrices = useMemo(() => {
    const values: number[] = [];
    for (let price = 0.03; price <= 0.2 + 1e-9; price += 0.01) {
      values.push(Number(price.toFixed(2)));
    }
    return values;
  }, []);

  const { grid, flatPoints } = useMemo(() => {
    const rows: HeatmapCell[][] = [];
    const points: HeatmapCell[] = [];
    for (const elecPrice of elecPrices) {
      const row: HeatmapCell[] = [];
      for (const btcPrice of btcPrices) {
        const dailyRevenueUsd = dailyBtc * btcPrice;
        const dailyElecUsd = totalPowerKw * 24 * elecPrice;
        const dailyNetUsd = dailyRevenueUsd - dailyElecUsd;
        const cell: HeatmapCell = {
          btcPrice,
          elecPrice,
          dailyRevenueUsd,
          dailyElecUsd,
          dailyNetUsd,
        };
        row.push(cell);
        points.push(cell);
      }
      rows.push(row);
    }
    return { grid: rows, flatPoints: points };
  }, [btcPrices, dailyBtc, elecPrices, totalPowerKw]);

  const { minNet, maxNet } = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of grid) {
      for (const cell of row) {
        if (cell.dailyNetUsd < min) min = cell.dailyNetUsd;
        if (cell.dailyNetUsd > max) max = cell.dailyNetUsd;
      }
    }
    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = 0;
    return { minNet: min, maxNet: max };
  }, [grid]);

  const absMax = Math.max(Math.abs(minNet), Math.abs(maxNet), 1);

  const getCellStyle = (value: number) => {
    const ratio = Math.min(Math.abs(value) / absMax, 1);
    const lightness = 96 - ratio * 40;
    return {
      backgroundColor: `hsl(0, 85%, ${lightness}%)`,
      color: "var(--fg-default)",
    } as const;
  };

  const viewOptions: Array<"chart" | "table"> = ["chart", "table"];
  const infoTitle = t("minerQuotation.charts.breakeven.infoTitle", {
    defaultValue: "Breakeven heatmap",
  });
  const infoBody = (
    <div className="space-y-4">
      <section>
        <h5 className="text-sm font-semibold text-[var(--fg-default)]">
          {t("minerQuotation.charts.info.what", { defaultValue: "What this chart shows" })}
        </h5>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          {t("minerQuotation.charts.breakeven.infoWhat", {
            defaultValue:
              "Each cell represents the daily net cash flow for your miner at a specific combination of BTC price and electricity rate. Green cells are profitable, red cells are underwater.",
          })}
        </p>
      </section>
      <section>
        <h5 className="text-sm font-semibold text-[var(--fg-default)]">
          {t("minerQuotation.charts.info.how", { defaultValue: "How it's calculated" })}
        </h5>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--fg-muted)]">
          {[t("minerQuotation.charts.breakeven.infoHow1", {
            defaultValue:
              "Daily revenue = mined BTC per day × BTC price for each column.",
          }),
          t("minerQuotation.charts.breakeven.infoHow2", {
            defaultValue:
              "Daily power cost = (power draw in kW × 24) × electricity price for each row.",
          }),
          t("minerQuotation.charts.breakeven.infoHow3", {
            defaultValue:
              "Net = revenue − power cost, and the dataset feeds both the color grid and the table view for manual inspection.",
          })].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h5 className="text-sm font-semibold text-[var(--fg-default)]">
          {t("minerQuotation.charts.info.takeaways", { defaultValue: "Key takeaways" })}
        </h5>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--fg-muted)]">
          {[t("minerQuotation.charts.breakeven.infoTakeaway1", {
            defaultValue:
              "Trace horizontally to see how sensitive profitability is to BTC price moves at your current power rate.",
          }),
          t("minerQuotation.charts.breakeven.infoTakeaway2", {
            defaultValue:
              "Trace vertically to test how much cushion you retain if your hosting provider raises rates.",
          }),
          t("minerQuotation.charts.breakeven.infoTakeaway3", {
            defaultValue:
              "Use the table to pull exact values for stress tests, lender decks, or underwriting memos.",
          })].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-[200px] flex-1 space-y-1">
          <h3 className="text-lg font-semibold text-[var(--fg-default)]">
            {t("minerQuotation.charts.breakeven.heading")}
          </h3>
          <p className="text-sm text-[var(--fg-muted)]">
            {t("minerQuotation.charts.breakeven.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsInfoOpen(true)}
          className="w-full rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--fg-default)] transition-colors hover:bg-[var(--bg-elevated)] sm:w-auto sm:text-sm"
        >
          {t("minerQuotation.charts.showDetails", { defaultValue: "Show details" })}
        </button>
      </div>

      <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
        {viewOptions.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
              viewMode === mode
                ? "border-[var(--accent-red)] bg-[var(--accent-red)] text-white"
                : "border-[var(--border-subtle)] text-[var(--fg-default)] hover:bg-[var(--bg-elevated)]"
            }`}
            aria-pressed={viewMode === mode}
          >
            {mode === "chart"
              ? t("minerQuotation.charts.table.chartLabel", { defaultValue: "Chart" })
              : t("minerQuotation.charts.table.tableLabel", { defaultValue: "Table" })}
          </button>
        ))}
      </div>

      {viewMode === "chart" ? (
        <div className="-mx-2 overflow-x-auto sm:mx-0">
          <table className="min-w-full border-collapse text-[0.65rem] sm:text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-[var(--bg-card)] px-1.5 py-1 text-left align-bottom text-[0.65rem] font-semibold sm:px-2 sm:py-1.5 sm:text-xs">
                  {t("minerQuotation.charts.breakeven.electricityLabel")}
                </th>
                {btcPrices.map((price) => (
                  <th
                    key={price}
                    className="px-1 py-1 text-center align-bottom text-[var(--fg-muted)] sm:px-2 sm:py-1.5"
                  >
                    ${price / 1000}k
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th className="sticky left-0 bg-[var(--bg-card)] px-1.5 py-1 text-left text-[var(--fg-muted)] font-medium sm:px-2 sm:py-1.5">
                    ${row[0]?.elecPrice.toFixed(2)}
                  </th>
                  {row.map((cell) => (
                    <td
                      key={`${cell.btcPrice}-${cell.elecPrice}`}
                      className="border border-[var(--border-subtle)] px-1 py-1 text-center sm:px-1.5 sm:py-1.5"
                      style={getCellStyle(cell.dailyNetUsd)}
                      title={`BTC $${cell.btcPrice.toLocaleString()} | Elec $${cell.elecPrice.toFixed(2)}/kWh`}
                    >
                      {formatCurrency(cell.dailyNetUsd)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="-mx-2 overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] sm:mx-0">
          <table className="min-w-full text-left text-[0.7rem] sm:text-xs">
            <thead>
              <tr className="text-left text-[var(--fg-muted)]">
                <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">
                  {t("minerQuotation.charts.table.asset", { defaultValue: "BTC Price" })}
                </th>
                <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">
                  {t("minerQuotation.charts.breakeven.electricityLabel", {
                    defaultValue: "Electricity ($/kWh)",
                  })}
                </th>
                <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">
                  {t("minerQuotation.charts.breakeven.dailyRevenue", {
                    defaultValue: "Daily Revenue",
                  })}
                </th>
                <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">
                  {t("minerQuotation.charts.breakeven.dailyPowerCost", {
                    defaultValue: "Daily Power Cost",
                  })}
                </th>
                <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">
                  {t("minerQuotation.charts.breakeven.dailyNet", {
                    defaultValue: "Daily Net",
                  })}
                </th>
              </tr>
            </thead>
            <tbody>
              {flatPoints.map((cell) => (
                <tr
                  key={`${cell.btcPrice}-${cell.elecPrice}`}
                  className="border-t border-[var(--border-subtle)] text-[var(--fg-default)]"
                >
                  <td className="whitespace-nowrap px-1.5 py-1 sm:px-2 sm:py-1.5">
                    ${cell.btcPrice.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1 sm:px-2 sm:py-1.5">
                    ${cell.elecPrice.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1 text-right sm:px-2 sm:py-1.5">
                    {formatCurrency(cell.dailyRevenueUsd)}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1 text-right sm:px-2 sm:py-1.5">
                    {formatCurrency(cell.dailyElecUsd)}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1 text-right sm:px-2 sm:py-1.5">
                    {formatCurrency(cell.dailyNetUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InfoModal
        title={infoTitle}
        body={infoBody}
        open={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
      />

      <div className="text-xs text-[var(--fg-muted)] flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <span>{t("minerQuotation.charts.breakeven.btcLabel")}</span>
        <span>{t("minerQuotation.charts.breakeven.electricityLabel")}</span>
      </div>
    </div>
  );
}

export default BreakevenHeatmap;
