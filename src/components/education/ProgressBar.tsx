import React from "react";

interface ProgressBarProps {
  completed: number;
  total: number;
}

export default function ProgressBar({ completed, total }: ProgressBarProps) {
  const percent = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="mb-4" aria-label="lesson progress">
      <div className="h-2 bg-neutral-200 rounded">
        <div
          className="h-2 bg-brand rounded"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-sm" aria-live="polite">
        {completed} of {total} complete
      </p>
    </div>
  );
}
