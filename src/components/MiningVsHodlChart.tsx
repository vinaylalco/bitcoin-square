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
import { type RoiScenarioPoint } from "../hooks/useRoiScenarios";

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
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="month" stroke="#d1d5db" />
          <YAxis
            stroke="#d1d5db"
            tickFormatter={(value: number) => formatCurrency(value)}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            labelFormatter={(label) => `Month ${label}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="miningValue"
            name="Mining (20%/yr price path)"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="hodlValue"
            name="Buy & HODL BTC (20%/yr price path)"
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
