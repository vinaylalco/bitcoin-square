import React, { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import { type RoiScenarioPoint } from "../hooks/useRoiScenarios";
import { getThemeColor } from "../utils/themeColors";
import { ScenarioDataTable } from "./ScenarioDataTable";
import { InfoModal } from "./InfoModal";
import { safeArray } from "../utils/safeTypes";

interface MiningVsHodlChartProps {
  points: RoiScenarioPoint[];
  totalCapexUsd: number;
}

const formatCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function MiningVsHodlChart({
  points,
  totalCapexUsd,
}: MiningVsHodlChartProps) {
  const { t } = useTranslation();
  const safePoints = safeArray(points);
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
  const legendWrapperStyle = useMemo(
    () => ({
      paddingTop: 8,
      display: "flex",
      flexWrap: "wrap" as const,
      justifyContent: "center",
      gap: 8,
      fontSize: "0.75rem",
    }),
    [],
  );

  const chartData = useMemo(
    () =>
      safePoints.map((point) => ({
        ...point,
        miningValue: point.cumNet_conservative + totalCapexUsd,
        hodlValue: point.hodl_conservative,
      })),
    [safePoints, totalCapexUsd],
  );

  if (!safePoints.length) {
    return null;
  }

  const viewOptions: Array<"chart" | "table"> = ["chart", "table"];
  const infoTitle = t("minerQuotation.charts.miningVsHodl.infoTitle", {
    defaultValue: "Mining vs. buying & holding BTC",
  });
  const infoBody = (
    <div className="space-y-4">
      <section>
        <h5 className="text-sm font-semibold text-[var(--fg-default)]">
          {t("minerQuotation.charts.info.what", { defaultValue: "What this chart shows" })}
        </h5>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          {t("minerQuotation.charts.miningVsHodl.infoWhat", {
            defaultValue:
              "This compares the projected value of mined bitcoin (net of operating costs plus your initial CAPEX) against the value of simply buying and holding the same USD amount of BTC on day one.",
          })}
        </p>
      </section>
      <section>
        <h5 className="text-sm font-semibold text-[var(--fg-default)]">
          {t("minerQuotation.charts.info.how", { defaultValue: "How it's calculated" })}
        </h5>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--fg-muted)]">
          {[t("minerQuotation.charts.miningVsHodl.infoHow1", {
            defaultValue:
              "Mining value = cumulative net cash flow + your original hardware spend, representing the stack you would own if you reinvested earnings back into BTC.",
          }),
          t("minerQuotation.charts.miningVsHodl.infoHow2", {
            defaultValue:
              "HODL value simulates putting the same USD into BTC on day zero and holding through the scenario-specific BTC price path.",
          }),
          t("minerQuotation.charts.miningVsHodl.infoHow3", {
            defaultValue:
              "Both lines inherit the calendar dates from the scenario explorer so you can line up milestones with deployment plans.",
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
          {[t("minerQuotation.charts.miningVsHodl.infoTakeaway1", {
            defaultValue:
              "Look for the crossover point where mining value overtakes HODL value—before that, buying BTC outright wins.",
          }),
          t("minerQuotation.charts.miningVsHodl.infoTakeaway2", {
            defaultValue:
              "The slope of each line highlights how leverage to network difficulty and BTC price changes your upside/downside.",
          }),
          t("minerQuotation.charts.miningVsHodl.infoTakeaway3", {
            defaultValue:
              "Use this with the scenario table to test pessimistic BTC prices, higher power costs, or different deployment dates.",
          })].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
  const labelWithDate = (
    label: string | number,
    payload?: Array<{ payload?: RoiScenarioPoint }>,
  ) => {
    const numericLabel = typeof label === "number" ? label : Number(label);
    if (!Number.isFinite(numericLabel)) {
      return label;
    }
    const point = payload?.[0]?.payload as RoiScenarioPoint | undefined;
    if (point?.date) {
      return t("minerQuotation.charts.monthWithDateLabel", {
        month: numericLabel,
        date: point.date,
        defaultValue: `Month ${numericLabel} (${point.date})`,
      });
    }
    return t("minerQuotation.charts.monthLabel", {
      value: numericLabel,
      defaultValue: `Month ${numericLabel}`,
    });
  };

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
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="month" stroke={axisColor} />
              <YAxis
                stroke={axisColor}
                tickFormatter={(value: number) => formatCurrency(value)}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                labelFormatter={(label, payload) => labelWithDate(label, payload)}
              />
              <Legend
                wrapperStyle={legendWrapperStyle}
                verticalAlign="bottom"
                height={48}
                iconType="circle"
              />
              <Line
                type="monotone"
                dataKey="miningValue"
                name={t("minerQuotation.charts.lines.mining")}
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="hodlValue"
                name={t("minerQuotation.charts.lines.hodl")}
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <ScenarioDataTable variant="miningVsHodl" points={chartData} />
      )}
      <InfoModal
        title={infoTitle}
        body={infoBody}
        open={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
      />
    </div>
  );
}

export default MiningVsHodlChart;
