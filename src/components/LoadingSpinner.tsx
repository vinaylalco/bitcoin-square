import React from "react";

type LoadingSpinnerProps = {
  label?: string;
};

export default function LoadingSpinner({ label = "Loading..." }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center gap-3 text-brand">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
      <span className="text-xs font-semibold uppercase tracking-[0.32em]">{label}</span>
    </div>
  );
}
