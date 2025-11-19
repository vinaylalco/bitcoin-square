import React, { useId } from "react";

interface InfoModalProps {
  title: string;
  body: React.ReactNode;
  open: boolean;
  onClose: () => void;
}

export function InfoModal({ title, body, open, onClose }: InfoModalProps) {
  const titleId = useId();

  if (!open) {
    return null;
  }

  const handleBackdropClick = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-3 py-6 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-[var(--bg-card)] p-4 text-[var(--fg-default)] shadow-2xl focus:outline-none sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h5 id={titleId} className="text-base font-semibold sm:text-lg">
            {title}
          </h5>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-[var(--border-subtle)] p-1.5 text-sm text-[var(--fg-default)] hover:bg-[var(--bg-elevated)]"
          >
            ×
          </button>
        </div>
        <div className="mt-3 max-h-[65vh] overflow-y-auto pr-1 text-sm leading-relaxed text-[var(--fg-default)] sm:mt-4 sm:max-h-[70vh]">
          {body}
        </div>
      </div>
    </div>
  );
}

export default InfoModal;
