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
  const [pop, setPop] = useState(false);

  // Measure container width
  useEffect(() => {
    const compute = () =>
      trackRef.current && setContainerW(trackRef.current.clientWidth);
    compute();
    const ro = new ResizeObserver(compute);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, []);

  // Scroll listener: update index (no gating — free navigation)
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const idx = Math.round(el.scrollLeft / containerW);

        if (idx !== activeIndex) {
          setActiveIndex(idx);

          // Award points once when moving past the furthest index
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
  }, [containerW, activeIndex, onAdvance]);

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
    el.scrollTo({ left: clamped * containerW, behavior: "smooth" });
  };

  // Party popper + smooth page scroll-to-top on card change
  useEffect(() => {
    // slight delay helps if layout shifts
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);

    setPop(true);
    const t = setTimeout(() => setPop(false), 700);
    return () => clearTimeout(t);
  }, [activeIndex]);

  // Keyboard support (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        scrollToIndex(activeIndex - 1);
      } else if (e.key === "ArrowRight") {
        scrollToIndex(activeIndex + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex]);

  return (
    <section className="w-full relative">
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

      {/* Confetti / party popper */}
      {pop && (
        <div className="popper z-30">
          <span className="dot bg-brand" />
          <span className="dot bg-yellow-400" />
          <span className="dot bg-emerald-500" />
          <span className="dot bg-rose-500" />
          <span className="dot bg-blue-500" />
          <span className="dot bg-orange-500" />
        </div>
      )}

      {/* Horizontal snap scroller */}
      <div className="relative">
        <div
          ref={trackRef}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar px-0 relative z-10"
          style={{ scrollPadding: "0px" }}
        >
          {lessons.map((l) => (
            <div key={l.id} className="snap-center w-full flex-shrink-0">
              <LessonCard lesson={l} />
            </div>
          ))}
        </div>

        {/* Overlay arrows (centered vertically, inset on sides) — hidden on mobile */}
        <button
          className="hidden md:grid place-items-center absolute left-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/90 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700 shadow z-30"
          onClick={() => scrollToIndex(activeIndex - 1)}
          aria-label="Previous lesson"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <button
          className="hidden md:grid place-items-center absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/90 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700 shadow z-30"
          onClick={() => scrollToIndex(activeIndex + 1)}
          aria-label="Next lesson"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
    </section>
  );
}
