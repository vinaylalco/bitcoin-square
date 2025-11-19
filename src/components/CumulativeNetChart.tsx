import React from "react";
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

interface CumulativeNetChartProps {
  points: RoiScenarioPoint[];
}

const SCENARIO_LINES = [
  {
    key: "cumNet_flat",
    label: "Flat (0%/yr)",
    color: "#fbbf24",
  },
  {
    key: "cumNet_conservative",
    label: "20%/yr",
    color: "#60a5fa",
  },
  {
    key: "cumNet_bullish",
    label: "40%/yr",
    color: "#34d399",
  },
  {
    key: "cumNet_ultra",
    label: "60%/yr",
    color: "#f472b6",
  },
] as const;

const formatCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;

export function CumulativeNetChart({ points }: CumulativeNetChartProps) {
  if (!points.length) {
    return null;
  }

  const hasUltra = points.some((point) => point.cumNet_ultra !== undefined);
  const lineConfigs = hasUltra
    ? SCENARIO_LINES
    : SCENARIO_LINES.filter((line) => line.key !== "cumNet_ultra");

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
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
