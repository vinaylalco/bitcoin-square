import React, { useMemo } from "react";
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
  const { t } = useTranslation();
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

  const data = [
    { label: t("minerQuotation.charts.passive.labels.mining"), annualIncomeUsd: miningIncome },
    { label: t("minerQuotation.charts.passive.labels.dividends"), annualIncomeUsd: 0.03 * BASE_CAPITAL_USD },
    { label: t("minerQuotation.charts.passive.labels.rental"), annualIncomeUsd: 0.05 * BASE_CAPITAL_USD },
    { label: t("minerQuotation.charts.passive.labels.savings"), annualIncomeUsd: 0.04 * BASE_CAPITAL_USD },
    { label: t("minerQuotation.charts.passive.labels.gold"), annualIncomeUsd: 0.01 * BASE_CAPITAL_USD },
    { label: t("minerQuotation.charts.passive.labels.hodl"), annualIncomeUsd: 0 },
  ];

  return (
    <div className="space-y-3">
      <div className="h-80">
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
      <p className="text-xs text-[var(--fg-muted)]">
        {t("minerQuotation.deepDive.passive.disclaimer")}
      </p>
    </div>
  );
}

export default PassiveIncomeComparisonChart;
