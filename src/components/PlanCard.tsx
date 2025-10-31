import React from "react";

export type PlanCardProps = {
  title: string;
  priceLabel: string;
  description: string;
  ctaLabel: string;
  isSelected?: boolean;
  highlight?: boolean;
  onSelect?: () => void;
  selectedLabel?: string;
};

export function PlanCard({
  title,
  priceLabel,
  description,
  ctaLabel,
  isSelected = false,
  highlight = false,
  onSelect,
  selectedLabel = "Selected",
}: PlanCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex flex-col gap-6 rounded-2xl border bg-[var(--bg-card)] p-8 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        isSelected ? "border-brand ring-2 ring-brand" : "border-[var(--border-subtle)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--fg-default)]">{title}</h2>
        {highlight ? (
          <span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
            Popular
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 text-[var(--fg-default)]">
        <span className="text-3xl font-extrabold">{priceLabel}</span>
        <span className="text-sm text-[var(--fg-muted)]">{description}</span>
      </div>
      <span
        className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] transition ${
          isSelected
            ? "border-brand bg-brand text-white shadow-lg"
            : "border-[var(--border-subtle)] text-[var(--fg-muted)] group-hover:border-brand group-hover:text-brand"
        }`}
      >
        {isSelected ? selectedLabel : ctaLabel}
      </span>
    </button>
  );
}

export default PlanCard;
