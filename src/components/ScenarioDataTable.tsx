import React from "react";
import { useTranslation } from "react-i18next";
import { type RoiScenarioPoint } from "../hooks/useRoiScenarios";

interface ScenarioDataTableProps {
  points: Array<
    RoiScenarioPoint & {
      miningValue?: number;
      hodlValue?: number;
    }
  >;
  variant: "cumulativeNet" | "miningVsHodl";
}

const formatCurrency = (value: number | undefined) => {
  if (value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
};

export function ScenarioDataTable({ points, variant }: ScenarioDataTableProps) {
  const { t } = useTranslation();

  if (!points.length) {
    return null;
  }

  const monthLabel = t("minerQuotation.charts.table.month", { defaultValue: "Month" });
  const dateLabel = t("minerQuotation.charts.table.date", { defaultValue: "Date" });
  const priceLabel = t("minerQuotation.charts.table.price", { defaultValue: "Price" });
  const cumNetLabel = t("minerQuotation.charts.table.cumNet", {
    defaultValue: "Cum. Net",
  });

  if (variant === "cumulativeNet") {
    const scenarios: Array<"flat" | "conservative" | "bullish" | "ultra"> = [
      "flat",
      "conservative",
      "bullish",
      "ultra",
    ];
    const hasUltra = points.some((point) => point.cumNet_ultra !== undefined);
    const activeScenarios = hasUltra
      ? scenarios
      : scenarios.filter((scenario) => scenario !== "ultra");

    return (
      <div className="-mx-2 overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] sm:mx-0">
        <table className="min-w-full text-left text-[0.7rem] sm:text-xs">
          <thead className="bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-200">
            <tr>
              <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">{monthLabel}</th>
              <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">{dateLabel}</th>
              {activeScenarios.map((scenario) => (
                <React.Fragment key={scenario}>
                  <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">
                    {t(`minerQuotation.charts.scenario.${scenario}`, {
                      defaultValue: scenario,
                    })}
                    {" "}
                    {priceLabel}
                  </th>
                  <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">
                    {t(`minerQuotation.charts.scenario.${scenario}`, {
                      defaultValue: scenario,
                    })}
                    {" "}
                    {cumNetLabel}
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr
                key={`${point.month}-${point.date}`}
                className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800"
              >
                <td className="whitespace-nowrap px-1.5 py-1 sm:px-2 sm:py-1.5">{point.month}</td>
                <td className="whitespace-nowrap px-1.5 py-1 sm:px-2 sm:py-1.5">{point.date}</td>
                {activeScenarios.map((scenario) => (
                  <React.Fragment key={`${point.month}-${scenario}`}>
                    <td className="whitespace-nowrap px-1.5 py-1 text-right sm:px-2 sm:py-1.5">
                      {formatCurrency(point[`price_${scenario}` as keyof RoiScenarioPoint] as number)}
                    </td>
                    <td className="whitespace-nowrap px-1.5 py-1 text-right sm:px-2 sm:py-1.5">
                      {formatCurrency(point[`cumNet_${scenario}` as keyof RoiScenarioPoint] as number)}
                    </td>
                  </React.Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="-mx-2 overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] sm:mx-0">
      <table className="min-w-full text-left text-[0.7rem] sm:text-xs">
        <thead className="bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-200">
          <tr>
            <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">{monthLabel}</th>
            <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">{dateLabel}</th>
            <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">
              {t("minerQuotation.charts.lines.mining", "Mining value (20%/yr)")}
            </th>
            <th className="px-1.5 py-1 font-medium sm:px-2 sm:py-1.5">
              {t("minerQuotation.charts.lines.hodl", "HODL value (20%/yr)")}
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr
              key={`${point.month}-${point.date}`}
              className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800"
            >
              <td className="whitespace-nowrap px-1.5 py-1 sm:px-2 sm:py-1.5">{point.month}</td>
              <td className="whitespace-nowrap px-1.5 py-1 sm:px-2 sm:py-1.5">{point.date}</td>
              <td className="whitespace-nowrap px-1.5 py-1 text-right sm:px-2 sm:py-1.5">
                {formatCurrency((point as { miningValue?: number }).miningValue)}
              </td>
              <td className="whitespace-nowrap px-1.5 py-1 text-right sm:px-2 sm:py-1.5">
                {formatCurrency((point as { hodlValue?: number }).hodlValue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ScenarioDataTable;
