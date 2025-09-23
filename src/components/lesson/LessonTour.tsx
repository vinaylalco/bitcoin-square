import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";

const HIGHLIGHT_PADDING = 16;
const DESKTOP_BREAKPOINT = 1024;

type StepTarget = {
  all?: string;
  desktop?: string;
  mobile?: string;
};

export interface LessonTourStep {
  id: string;
  title: string;
  description: string;
  target?: StepTarget;
}

interface LessonTourProps {
  open: boolean;
  steps: LessonTourStep[];
  onDismiss: () => void;
  onComplete: () => void;
}

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function resolveTargetSelector(
  target: StepTarget | undefined,
  isDesktop: boolean,
): string | undefined {
  if (!target) return undefined;
  if (target.all) return target.all;
  if (isDesktop) {
    return target.desktop ?? target.mobile;
  }
  return target.mobile ?? target.desktop;
}

export default function LessonTour({
  open,
  steps,
  onDismiss,
  onComplete,
}: LessonTourProps) {
  const { t, i18n } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    setCurrentIndex(0);
  }, [open]);

  const activeStep = steps[currentIndex];
  const totalSteps = steps.length;

  const tourHeading = useMemo(
    () =>
      t("lesson.tour.heading", {
        current: currentIndex + 1,
        total: totalSteps,
      }),
    [currentIndex, t, totalSteps],
  );

  const updateHighlight = useCallback(() => {
    if (typeof window === "undefined" || !open) {
      setHighlightRect(null);
      return;
    }
    const isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;
    const selector = resolveTargetSelector(activeStep?.target, isDesktop);
    if (!selector) {
      setHighlightRect(null);
      return;
    }
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
      setHighlightRect(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    const paddedRect = {
      top: Math.max(0, rect.top - HIGHLIGHT_PADDING),
      left: Math.max(0, rect.left - HIGHLIGHT_PADDING),
      width: rect.width + HIGHLIGHT_PADDING * 2,
      height: rect.height + HIGHLIGHT_PADDING * 2,
    };
    setHighlightRect(paddedRect);
  }, [activeStep?.target, open]);

  useLayoutEffect(() => {
    if (!open) return;
    updateHighlight();
  }, [open, currentIndex, updateHighlight]);

  useEffect(() => {
    if (!open) return;
    updateHighlight();
  }, [open, updateHighlight, i18n.language]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;
    const selector = resolveTargetSelector(activeStep?.target, isDesktop);
    if (!selector) return;
    const element = document.querySelector<HTMLElement>(selector);
    if (!element || typeof element.scrollIntoView !== "function") return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeStep?.target, open, i18n.language]);

  useEffect(() => {
    if (!open) return;
    const handleResize = () => updateHighlight();
    const handleScroll = () => updateHighlight();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setCurrentIndex((idx) => Math.min(idx + 1, totalSteps - 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentIndex((idx) => Math.max(idx - 1, 0));
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, totalSteps, updateHighlight, onDismiss]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
  }, [open]);

  if (!open || !activeStep) {
    return null;
  }

  const goToPrevious = () => {
    setCurrentIndex((idx) => Math.max(idx - 1, 0));
  };

  const goToNext = () => {
    if (currentIndex === totalSteps - 1) {
      onComplete();
      return;
    }
    setCurrentIndex((idx) => Math.min(idx + 1, totalSteps - 1));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center px-4 pb-8">
      <div
        className="absolute inset-0 transition-colors"
        style={{ background: "var(--tour-scrim)" }}
        aria-hidden
      />
      {highlightRect ? (
        <div
          className="pointer-events-none absolute rounded-3xl border-2 border-brand transition-all duration-200"
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
            boxShadow: "0 0 0 9999px var(--tour-highlight-shadow)",
            background: "var(--tour-highlight-fill)",
          }}
          aria-hidden
        />
      ) : null}
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`lesson-tour-step-${activeStep.id}`}
        className="relative z-10 w-full max-w-lg rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              {tourHeading}
            </p>
            <h2
              id={`lesson-tour-step-${activeStep.id}`}
              className="mt-2 text-xl font-bold tracking-tight"
            >
              {activeStep.title}
            </h2>
            <p className="mt-3 text-sm text-[var(--fg-muted)]">
              {activeStep.description}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-default)] transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label={t("lesson.tour.skip")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--fg-default)] transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2"
          >
            {t("lesson.tour.skip")}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToPrevious}
              disabled={currentIndex === 0}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-default)] transition disabled:cursor-not-allowed disabled:opacity-50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ChevronLeft className="h-4 w-4" /> {t("lesson.tour.prev")}
            </button>
            <button
              type="button"
              onClick={goToNext}
              className="inline-flex items-center gap-2 rounded-full border border-brand bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-white shadow-[0_12px_30px_rgba(169,21,255,0.35)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {currentIndex === totalSteps - 1
                ? t("lesson.tour.finish")
                : t("lesson.tour.next")}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

