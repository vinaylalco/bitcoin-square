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

interface CumulativeNetChartProps {
  points: RoiScenarioPoint[];
}

const formatCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;

export function CumulativeNetChart({ points }: CumulativeNetChartProps) {
  const { t } = useTranslation();
  const safePoints = safeArray(points);
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const axisColor = useMemo(
    () => getThemeColor("--fg-muted", "#000000"),
    [],
  );
  const gridColor = useMemo(
    () => getThemeColor("--border-subtle", "#000000"),
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

  const scenarioLines = useMemo(
    () => [
      {
        key: "cumNet_flat",
        label: t("minerQuotation.charts.scenario.flat"),
        color: "var(--accent-red)",
      },
      {
        key: "cumNet_conservative",
        label: t("minerQuotation.charts.scenario.conservative"),
        color: "var(--accent-red)",
      },
      {
        key: "cumNet_bullish",
        label: t("minerQuotation.charts.scenario.bullish"),
        color: "var(--accent-red)",
      },
      {
        key: "cumNet_ultra",
        label: t("minerQuotation.charts.scenario.ultra"),
        color: "var(--accent-red)",
      },
    ],
    [t],
  );

  if (!safePoints.length) {
    return null;
  }

  const hasUltra = safePoints.some((point) => point.cumNet_ultra !== undefined);
  const lineConfigs = hasUltra
    ? scenarioLines
    : scenarioLines.filter((line) => line.key !== "cumNet_ultra");

  const viewOptions: Array<"chart" | "table"> = ["chart", "table"];
  const infoTitle = t("minerQuotation.charts.cumulative.infoTitle", {
    defaultValue: "Cumulative net cash flow (scenario explorer)",
  });
  const infoBody = (
    <div className="space-y-4">
      <section>
        <h5 className="text-sm font-semibold text-[var(--fg-default)]">
          {t("minerQuotation.charts.info.what", { defaultValue: "What this chart shows" })}
        </h5>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          {t("minerQuotation.charts.cumulative.infoWhat", {
            defaultValue:
              "Each line tracks the running total of mining revenue minus electricity, hosting fees, and the upfront hardware purchase so you can see when (or if) payback happens under different BTC price paths.",
          })}
        </p>
      </section>
      <section>
        <h5 className="text-sm font-semibold text-[var(--fg-default)]">
          {t("minerQuotation.charts.info.how", { defaultValue: "How it's calculated" })}
        </h5>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--fg-muted)]">
          {[t("minerQuotation.charts.cumulative.infoHow1", {
            defaultValue:
              "The ROI hook produces monthly points starting at your selected simulation date, subtracting power + hosting from BTC revenue for each price trajectory.",
          }),
          t("minerQuotation.charts.cumulative.infoHow2", {
            defaultValue:
              "Month zero includes the total CAPEX outlay so the curve starts negative and climbs as cash flow accrues.",
          }),
          t("minerQuotation.charts.cumulative.infoHow3", {
            defaultValue:
              "The chart and table views use the exact same monthly dataset, so every point can be audited line by line.",
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
          {[t("minerQuotation.charts.cumulative.infoTakeaway1", {
            defaultValue:
              "Watch where each scenario crosses $0 to estimate the payback month and compare it to the calendar date shown in tooltips and tables.",
          }),
          t("minerQuotation.charts.cumulative.infoTakeaway2", {
            defaultValue:
              "The gap between scenarios highlights how sensitive ROI is to BTC price—use the date selector to align with your deployment timeline.",
          }),
          t("minerQuotation.charts.cumulative.infoTakeaway3", {
            defaultValue:
              "Flat or downward slopes indicate you should revisit assumptions like power price or efficiency before ordering hardware.",
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
      </div>
      {viewMode === "chart" ? (
        <div className="h-64 w-full sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={safePoints}
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
              {lineConfigs.map((line) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.label}
                  stroke={line.color}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <ScenarioDataTable variant="cumulativeNet" points={safePoints} />
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

export default CumulativeNetChart;
