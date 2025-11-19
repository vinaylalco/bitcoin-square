import React, { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import { getThemeColor } from "../utils/themeColors";
import { InfoModal } from "./InfoModal";

interface PassiveIncomeComparisonChartProps {
  monthlyNetUsd: number;
  totalCapexUsd: number;
}

const BASE_CAPITAL_USD = 10_000;

const formatCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

interface PassiveIncomeRow {
  label: string;
  annualIncomeUsd: number;
  assumedYieldPercent: number;
}

export function PassiveIncomeComparisonChart({
  monthlyNetUsd,
  totalCapexUsd,
}: PassiveIncomeComparisonChartProps) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const axisColor = useMemo(
    () => getThemeColor("--fg-muted", "#d1d5db"),
    [],
  );
  const gridColor = useMemo(
    () => getThemeColor("--border-subtle", "#374151"),
    [],
  );

  const annualMiningYield =
    totalCapexUsd > 0 ? (monthlyNetUsd * 12) / totalCapexUsd : 0;
  const miningIncome = annualMiningYield * BASE_CAPITAL_USD;

  const data: PassiveIncomeRow[] = useMemo(
    () => [
      {
        label: t("minerQuotation.charts.passive.labels.mining"),
        annualIncomeUsd: miningIncome,
        assumedYieldPercent: annualMiningYield * 100,
      },
      {
        label: t("minerQuotation.charts.passive.labels.dividends"),
        annualIncomeUsd: 0.03 * BASE_CAPITAL_USD,
        assumedYieldPercent: 3,
      },
      {
        label: t("minerQuotation.charts.passive.labels.rental"),
        annualIncomeUsd: 0.05 * BASE_CAPITAL_USD,
        assumedYieldPercent: 5,
      },
      {
        label: t("minerQuotation.charts.passive.labels.savings"),
        annualIncomeUsd: 0.04 * BASE_CAPITAL_USD,
        assumedYieldPercent: 4,
      },
      {
        label: t("minerQuotation.charts.passive.labels.gold"),
        annualIncomeUsd: 0.01 * BASE_CAPITAL_USD,
        assumedYieldPercent: 1,
      },
      {
        label: t("minerQuotation.charts.passive.labels.hodl"),
        annualIncomeUsd: 0,
        assumedYieldPercent: 0,
      },
    ],
    [annualMiningYield, miningIncome, t],
  );

  const viewOptions: Array<"chart" | "table"> = ["chart", "table"];
  const infoTitle = t("minerQuotation.charts.passive.infoTitle", {
    defaultValue: "Passive income comparison",
  });
  const infoBody = (
    <div className="space-y-4">
      <section>
        <h5 className="text-sm font-semibold text-[var(--fg-default)]">
          {t("minerQuotation.charts.info.what", { defaultValue: "What this chart shows" })}
        </h5>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          {t("minerQuotation.charts.passive.infoWhat", {
            defaultValue:
              "It compares the annual income a $10,000 allocation could earn across mining, dividends, rentals, savings, gold, or simply holding BTC.",
          })}
        </p>
      </section>
      <section>
        <h5 className="text-sm font-semibold text-[var(--fg-default)]">
          {t("minerQuotation.charts.info.how", { defaultValue: "How it's calculated" })}
        </h5>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--fg-muted)]">
          {[t("minerQuotation.charts.passive.infoHow1", {
            defaultValue:
              "Mining yield is derived from your modeled monthly net USD divided by total CAPEX to estimate an annual % return.",
          }),
          t("minerQuotation.charts.passive.infoHow2", {
            defaultValue:
              "Traditional assets use representative yields (e.g., 3% dividends, 5% rental) applied to $10k to keep comparisons apples-to-apples.",
          }),
          t("minerQuotation.charts.passive.infoHow3", {
            defaultValue:
              "Both the bar chart and the table pull from the exact same dataset so you can export or sanity-check values easily.",
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
          {[t("minerQuotation.charts.passive.infoTakeaway1", {
            defaultValue:
              "A higher mining bar suggests your modeled operation out-earns mainstream yield strategies on the same capital base.",
          }),
          t("minerQuotation.charts.passive.infoTakeaway2", {
            defaultValue:
              "If the mining bar falls below safer options, revisit your inputs or consider reallocating some capital.",
          }),
          t("minerQuotation.charts.passive.infoTakeaway3", {
            defaultValue:
              "Use the assumed yield column to communicate these comparisons to partners, lenders, or LPs.",
          })].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setIsInfoOpen(true)}
          className="w-full rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--fg-default)] transition-colors hover:bg-[var(--bg-elevated)] sm:w-auto sm:text-sm"
        >
          {t("minerQuotation.charts.showDetails", { defaultValue: "Show details" })}
        </button>
        <div className="flex flex-wrap gap-2">
          {viewOptions.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                viewMode === mode
                  ? "border-orange-500 bg-orange-500 text-white"
                  : "border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              }`}
              aria-pressed={viewMode === mode}
            >
              {mode === "chart"
                ? t("minerQuotation.charts.table.chartLabel", { defaultValue: "Chart" })
                : t("minerQuotation.charts.table.tableLabel", { defaultValue: "Table" })}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "chart" ? (
        <div className="h-64 w-full sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="label" stroke={axisColor} angle={-20} textAnchor="end" height={50} />
              <YAxis stroke={axisColor} tickFormatter={formatCurrency} />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                labelFormatter={(label) => `${label}`}
              />
              <Bar
                dataKey="annualIncomeUsd"
                name={t("minerQuotation.charts.passive.annualIncome")}
                fill="#60a5fa"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="-mx-2 overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] sm:mx-0">
          <table className="min-w-full text-left text-[0.7rem] sm:text-xs">
            <thead>
              <tr className="text-left text-[var(--fg-muted)]">
                <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">
                  {t("minerQuotation.charts.passive.asset", { defaultValue: "Asset" })}
                </th>
                <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">
                  {t("minerQuotation.charts.passive.assumedYield", {
                    defaultValue: "Assumed yield (%)",
                  })}
                </th>
                <th className="px-1.5 py-1 text-right font-medium sm:px-2 sm:py-1.5">
                  {t("minerQuotation.charts.passive.annualIncome", {
                    defaultValue: "Annual income from $10,000",
                  })}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.label}
                  className="border-t border-[var(--border-subtle)] text-[var(--fg-default)]"
                >
                  <td className="whitespace-nowrap px-1.5 py-1 sm:px-2 sm:py-1.5">{row.label}</td>
                  <td className="whitespace-nowrap px-1.5 py-1 sm:px-2 sm:py-1.5">
                    {`${row.assumedYieldPercent.toFixed(1)}%`}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1 text-right sm:px-2 sm:py-1.5">
                    {formatCurrency(row.annualIncomeUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-[var(--fg-muted)]">
        {t("minerQuotation.deepDive.passive.disclaimer")}
      </p>
      <InfoModal
        title={infoTitle}
        body={infoBody}
        open={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
      />
    </div>
  );
}

export default PassiveIncomeComparisonChart;
