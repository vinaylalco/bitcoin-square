import React, { useMemo } from "react";

interface BreakevenHeatmapProps {
  dailyBtc: number;
  totalPowerKw: number;
}

interface HeatmapCell {
  btcPrice: number;
  elecPrice: number;
  dailyNetUsd: number;
}

const formatCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function BreakevenHeatmap({
  dailyBtc,
  totalPowerKw,
}: BreakevenHeatmapProps) {
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

  const grid = useMemo(() => {
    const rows: HeatmapCell[][] = [];
    for (const elecPrice of elecPrices) {
      const row: HeatmapCell[] = [];
      for (const btcPrice of btcPrices) {
        const dailyRevenueUsd = dailyBtc * btcPrice;
        const dailyElecUsd = totalPowerKw * 24 * elecPrice;
        const dailyNetUsd = dailyRevenueUsd - dailyElecUsd;
        row.push({ btcPrice, elecPrice, dailyNetUsd });
      }
      rows.push(row);
    }
    return rows;
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
    const hue = value >= 0 ? 140 : 0; // green for profit, red for loss
    const lightness = 92 - ratio * 50; // brighter near zero, darker at extremes
    return {
      backgroundColor: `hsl(${hue}, 65%, ${lightness}%)`,
      color: "var(--fg-default)",
    } as const;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-[var(--fg-default)]">
          Breakeven BTC price vs electricity cost
        </h3>
        <p className="text-sm text-[var(--fg-muted)]">
          Daily net profit for different BTC prices and electricity rates. Helps you see at what price you break even.
        </p>
      </div>

      <div className="overflow-auto border border-[var(--border-subtle)] rounded-lg">
        <table className="min-w-full border-collapse text-xs md:text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[var(--bg-card)] px-3 py-2 text-left align-bottom">Electricity Cost (USD/kWh)</th>
              {btcPrices.map((price) => (
                <th key={price} className="px-2 py-2 text-center align-bottom text-[var(--fg-muted)]">
                  ${price / 1000}k
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th className="sticky left-0 bg-[var(--bg-card)] px-3 py-2 text-left text-[var(--fg-muted)] font-medium">
                  ${row[0]?.elecPrice.toFixed(2)}
                </th>
                {row.map((cell) => (
                  <td
                    key={`${cell.btcPrice}-${cell.elecPrice}`}
                    className="px-1 py-1 text-center border border-[var(--border-subtle)]"
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

      <div className="text-xs text-[var(--fg-muted)] flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <span>BTC Price (USD)</span>
        <span>Electricity Cost (USD/kWh)</span>
      </div>
    </div>
  );
}

export default BreakevenHeatmap;
