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
  const axisColor = useMemo(
    () => getThemeColor("--fg-muted", "#d1d5db"),
    [],
  );
  const gridColor = useMemo(
    () => getThemeColor("--border-subtle", "#374151"),
    [],
  );

  const chartData = useMemo(
    () =>
      points.map((point) => ({
        ...point,
        miningValue: point.cumNet_conservative + totalCapexUsd,
        hodlValue: point.hodl_conservative,
      })),
    [points, totalCapexUsd],
  );

  if (!points.length) {
    return null;
  }

  return (
    <div className="h-80">
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
            labelFormatter={(label) =>
              t("minerQuotation.charts.monthLabel", { value: label })
            }
          />
          <Legend />
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
  );
}

export default MiningVsHodlChart;
