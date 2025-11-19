import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface PassiveIncomeComparisonChartProps {
  monthlyNetUsd: number;
  totalCapexUsd: number;
}

const BASE_CAPITAL_USD = 10_000;

const formatCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function PassiveIncomeComparisonChart({
  monthlyNetUsd,
  totalCapexUsd,
}: PassiveIncomeComparisonChartProps) {
  const annualMiningYield =
    totalCapexUsd > 0 ? (monthlyNetUsd * 12) / totalCapexUsd : 0;
  const miningIncome = annualMiningYield * BASE_CAPITAL_USD;

  const data = [
    { label: "Mining", annualIncomeUsd: miningIncome },
    { label: "Dividend stocks", annualIncomeUsd: 0.03 * BASE_CAPITAL_USD },
    { label: "Rental property", annualIncomeUsd: 0.05 * BASE_CAPITAL_USD },
    { label: "Savings / T-bills", annualIncomeUsd: 0.04 * BASE_CAPITAL_USD },
    { label: "Gold", annualIncomeUsd: 0.01 * BASE_CAPITAL_USD },
    { label: "BTC HODL", annualIncomeUsd: 0 },
  ];

  return (
    <div className="space-y-3">
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="label" stroke="#d1d5db" angle={-20} textAnchor="end" height={50} />
            <YAxis stroke="#d1d5db" tickFormatter={formatCurrency} />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              labelFormatter={(label) => `${label}`}
            />
            <Bar dataKey="annualIncomeUsd" name="Annual income" fill="#60a5fa" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-[var(--fg-muted)]">
        These are simple, hypothetical yields to give an idea of potential income; your specific
        results may vary and mining carries more operational and market risk than most of the other
        examples.
      </p>
    </div>
  );
}

export default PassiveIncomeComparisonChart;
