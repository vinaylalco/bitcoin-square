import React, { useEffect, useMemo, useRef, useState } from "react";
import LessonCard from "./LessonCard";
import type { LessonCardData } from "./types";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  lessons: LessonCardData[];
  /** Called when the user advances past the previous highest index (for points) */
  onAdvance?: (newIndex: number, deltaForward: number) => void;
};

export default function CardStack({ lessons, onAdvance }: Props) {
  const total = lessons.length;
  const trackRef = useRef<HTMLDivElement>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [containerW, setContainerW] = useState(1);
  const lastIndexRef = useRef(0);

  /** Tracks whether each card has satisfied the "can advance" requirement */
  const [canAdvanceMap, setCanAdvanceMap] = useState<Record<number, boolean>>(
    {}
  );

  // Measure container width
  useEffect(() => {
    const compute = () =>
      trackRef.current && setContainerW(trackRef.current.clientWidth);
    compute();
    const ro = new ResizeObserver(compute);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, []);

  // Scroll listener: update index; forbid forward if current card not answered
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const idx = Math.round(el.scrollLeft / containerW);

        // If trying to go forward but current card not answered -> snap back
        const tryingForward = idx > activeIndex;
        const currentAnswered = !!canAdvanceMap[activeIndex];
        if (tryingForward && !currentAnswered) {
          el.scrollTo({
            left: activeIndex * containerW,
            behavior: "smooth",
          });
          ticking = false;
          return;
        }

        if (idx !== activeIndex) {
          setActiveIndex(idx);
          if (idx > lastIndexRef.current) {
            const delta = idx - lastIndexRef.current;
            onAdvance?.(idx, delta);
            lastIndexRef.current = idx;
          }
        }
        ticking = false;
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [containerW, activeIndex, canAdvanceMap, onAdvance]);

  // progress %
  const percent = useMemo(
    () =>
      Math.min(100, Math.max(0, Math.round((activeIndex / total) * 100))),
    [activeIndex, total]
  );

  const scrollToIndex = (targetIndex: number) => {
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(total - 1, targetIndex));

    // Before moving forward, enforce gating
    if (clamped > activeIndex && !canAdvanceMap[activeIndex]) return;

    el.scrollTo({ left: clamped * containerW, behavior: "smooth" });
  };

  const nextDisabled = !canAdvanceMap[activeIndex] || activeIndex >= total - 1;

  // Keyboard support (left/right arrows)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        scrollToIndex(activeIndex - 1);
      } else if (e.key === "ArrowRight") {
        if (!nextDisabled) scrollToIndex(activeIndex + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, nextDisabled]);

  return (
    <section className="w-full">
      {/* Progress bar + % */}
      <div className="px-4 sm:px-6 mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">{percent}%</span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {activeIndex + 1} / {total}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
        >
          <div
            className="h-full bg-brand transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Horizontal snap scroller */}
      <div
        className="relative"
        // container is relative so overlay arrows can be centered over card
      >
        {/* Track */}
        <div
          ref={trackRef}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar px-0 relative z-10"
          style={{ scrollPadding: "0px" }}
        >
          {lessons.map((l, i) => (
            <div key={l.id} className="snap-center w-full flex-shrink-0">
              <LessonCard
                lesson={l}
                onAnswerStateChange={(ok) =>
                  setCanAdvanceMap((m) => ({ ...m, [i]: ok }))
                }
              />
            </div>
          ))}
        </div>

        {/* Overlay arrows (centered vertically, inset on sides) */}
        <button
          className="grid place-items-center absolute left-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/90 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700 shadow z-30"
          onClick={() => scrollToIndex(activeIndex - 1)}
          aria-label="Previous lesson"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <button
          className={`grid place-items-center absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full border shadow z-30
            ${nextDisabled
              ? "bg-white/60 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 opacity-50 pointer-events-none"
              : "bg-white/90 dark:bg-neutral-800/90 border-neutral-200 dark:border-neutral-700"
            }`}
          onClick={() => scrollToIndex(activeIndex + 1)}
          aria-label="Next lesson"
          aria-disabled={nextDisabled}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
    </section>
  );
}
