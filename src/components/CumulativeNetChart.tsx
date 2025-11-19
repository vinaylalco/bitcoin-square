import React, { useMemo } from "react";
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

interface CumulativeNetChartProps {
  points: RoiScenarioPoint[];
}

const formatCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;

export function CumulativeNetChart({ points }: CumulativeNetChartProps) {
  const { t } = useTranslation();
  const axisColor = useMemo(
    () => getThemeColor("--fg-muted", "#d1d5db"),
    [],
  );
  const gridColor = useMemo(
    () => getThemeColor("--border-subtle", "#374151"),
    [],
  );

  const scenarioLines = useMemo(
    () => [
      {
        key: "cumNet_flat",
        label: t("minerQuotation.charts.scenario.flat"),
        color: "#fbbf24",
      },
      {
        key: "cumNet_conservative",
        label: t("minerQuotation.charts.scenario.conservative"),
        color: "#60a5fa",
      },
      {
        key: "cumNet_bullish",
        label: t("minerQuotation.charts.scenario.bullish"),
        color: "#34d399",
      },
      {
        key: "cumNet_ultra",
        label: t("minerQuotation.charts.scenario.ultra"),
        color: "#f472b6",
      },
    ],
    [t],
  );

  if (!points.length) {
    return null;
  }

  const hasUltra = points.some((point) => point.cumNet_ultra !== undefined);
  const lineConfigs = hasUltra
    ? scenarioLines
    : scenarioLines.filter((line) => line.key !== "cumNet_ultra");

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
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
            labelFormatter={(label) =>
              t("minerQuotation.charts.monthLabel", { value: label })
            }
          />
          <Legend />
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
  );
}

export default CumulativeNetChart;
