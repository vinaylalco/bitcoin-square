import { useMemo } from "react";

export interface RoiScenarioPoint {
  month: number;
  date: string;
  price_flat: number;
  price_conservative: number;
  price_bullish: number;
  price_ultra: number;
  cumNet_flat: number;
  cumNet_conservative: number;
  cumNet_bullish: number;
  cumNet_ultra: number;
  hodl_flat: number;
  hodl_conservative: number;
  hodl_bullish: number;
  hodl_ultra: number;
}

export interface RoiScenarioResult {
  points: RoiScenarioPoint[];
  paybackMonths_flat: number | null;
  paybackMonths_conservative: number | null;
  paybackMonths_bullish: number | null;
  paybackMonths_ultra: number | null;
}

interface UseRoiScenariosParams {
  dailyBtc: number;
  dailyElecUsd: number;
  totalCapexUsd: number;
  btcPriceUsd: number;
  months?: number;
  startDate?: Date;
}

const SCENARIO_GROWTH_RATES = {
  flat: 0,
  conservative: 0.2,
  bullish: 0.4,
  ultra: 0.6,
} as const;

export function useRoiScenarios({
  dailyBtc,
  dailyElecUsd,
  totalCapexUsd,
  btcPriceUsd,
  months = 60,
  startDate,
}: UseRoiScenariosParams): RoiScenarioResult {
  const anchorTimestamp = startDate?.getTime();

  return useMemo(() => {
    const simulationMonths = Math.max(0, Math.floor(months));
    const monthlyElecUsd = dailyElecUsd * 30;
    const hodlBtc = btcPriceUsd > 0 ? totalCapexUsd / btcPriceUsd : 0;

    const anchorDate = anchorTimestamp ? new Date(anchorTimestamp) : new Date();
    anchorDate.setHours(0, 0, 0, 0);

    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const monthValue = `${date.getMonth() + 1}`.padStart(2, "0");
      const day = `${date.getDate()}`.padStart(2, "0");
      return `${year}-${monthValue}-${day}`;
    };

    const getDateForMonth = (monthIndex: number) => {
      const date = new Date(anchorDate);
      date.setMonth(date.getMonth() + monthIndex);
      return formatDate(date);
    };

    let cumulativeFlat = 0;
    let cumulativeConservative = 0;
    let cumulativeBullish = 0;
    let cumulativeUltra = 0;

    let paybackFlat: number | null = null;
    let paybackConservative: number | null = null;
    let paybackBullish: number | null = null;
    let paybackUltra: number | null = null;

    const points: RoiScenarioPoint[] = [];

    for (let month = 0; month <= simulationMonths; month += 1) {
      const tYears = month / 12;

      const price_flat = btcPriceUsd * (1 + SCENARIO_GROWTH_RATES.flat) ** tYears;
      const price_conservative =
        btcPriceUsd * (1 + SCENARIO_GROWTH_RATES.conservative) ** tYears;
      const price_bullish =
        btcPriceUsd * (1 + SCENARIO_GROWTH_RATES.bullish) ** tYears;
      const price_ultra = btcPriceUsd * (1 + SCENARIO_GROWTH_RATES.ultra) ** tYears;

      const monthlyRevenue_flat = dailyBtc * 30 * price_flat;
      const monthlyRevenue_conservative = dailyBtc * 30 * price_conservative;
      const monthlyRevenue_bullish = dailyBtc * 30 * price_bullish;
      const monthlyRevenue_ultra = dailyBtc * 30 * price_ultra;

      const monthlyNet_flat = monthlyRevenue_flat - monthlyElecUsd;
      const monthlyNet_conservative = monthlyRevenue_conservative - monthlyElecUsd;
      const monthlyNet_bullish = monthlyRevenue_bullish - monthlyElecUsd;
      const monthlyNet_ultra = monthlyRevenue_ultra - monthlyElecUsd;

      cumulativeFlat += monthlyNet_flat;
      cumulativeConservative += monthlyNet_conservative;
      cumulativeBullish += monthlyNet_bullish;
      cumulativeUltra += monthlyNet_ultra;

      if (paybackFlat === null && cumulativeFlat >= totalCapexUsd) {
        paybackFlat = month;
      }
      if (paybackConservative === null && cumulativeConservative >= totalCapexUsd) {
        paybackConservative = month;
      }
      if (paybackBullish === null && cumulativeBullish >= totalCapexUsd) {
        paybackBullish = month;
      }
      if (paybackUltra === null && cumulativeUltra >= totalCapexUsd) {
        paybackUltra = month;
      }

      points.push({
        // month tracks elapsed months since the start date and date is the
        // resolved calendar date based on that start date.
        month,
        date: getDateForMonth(month),
        price_flat,
        price_conservative,
        price_bullish,
        price_ultra,
        cumNet_flat: cumulativeFlat,
        cumNet_conservative: cumulativeConservative,
        cumNet_bullish: cumulativeBullish,
        cumNet_ultra: cumulativeUltra,
        hodl_flat: hodlBtc * price_flat,
        hodl_conservative: hodlBtc * price_conservative,
        hodl_bullish: hodlBtc * price_bullish,
        hodl_ultra: hodlBtc * price_ultra,
      });
    }

    return {
      points,
      paybackMonths_flat: paybackFlat,
      paybackMonths_conservative: paybackConservative,
      paybackMonths_bullish: paybackBullish,
      paybackMonths_ultra: paybackUltra,
    };
  }, [
    anchorTimestamp,
    btcPriceUsd,
    dailyBtc,
    dailyElecUsd,
    months,
    totalCapexUsd,
  ]);
}
