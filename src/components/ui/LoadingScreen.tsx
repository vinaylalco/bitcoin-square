import React from "react";

const defaultLabel = "Loading...";

type LoadingScreenProps = {
  label?: string;
};

export default function LoadingScreen({ label = defaultLabel }: LoadingScreenProps) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">{label}</p>
      </div>
    </div>
  );
}
