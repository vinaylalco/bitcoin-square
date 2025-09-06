import React, { useEffect, useRef } from "react";
import type { Card } from "../../types/lesson-plan";
import LessonCard from "./LessonCard";
import ProgressBar from "./ProgressBar";

interface LessonSliderProps {
  lessons: Card[];
  currentIndex: number;
  setCurrentIndex: (i: number) => void;
  completed: Set<string>;
  onComplete: (id: string) => void;
}

export default function LessonSlider({
  lessons,
  currentIndex,
  setCurrentIndex,
  completed,
  onComplete,
}: LessonSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>();

  const scrollToIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(index, lessons.length - 1));
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth;
    container.scrollTo({ left: width * clamped, behavior: "smooth" });
    setCurrentIndex(clamped);
  };

  const next = () => scrollToIndex(currentIndex + 1);
  const prev = () => scrollToIndex(currentIndex - 1);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth;
    const newIndex = Math.round(container.scrollLeft / width);
    if (newIndex !== currentIndex) {
      setCurrentIndex(newIndex);
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        next();
      } else if (e.key === "ArrowLeft") {
        prev();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  useEffect(() => {
    const container = containerRef.current;
    const slide = container?.children[currentIndex] as HTMLElement | undefined;
    slide?.focus();
  }, [currentIndex]);

  const handlePointerDown = (e: React.PointerEvent) => {
    startXRef.current = e.clientX;
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (startXRef.current == null) return;
    const dx = e.clientX - startXRef.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) {
        next();
      } else {
        prev();
      }
    }
    startXRef.current = undefined;
  };

  const handleCorrect = (id: string) => {
    onComplete(id);
    setTimeout(() => {
      next();
    }, 600);
  };

  return (
    <div className="relative">
      <ProgressBar completed={completed.size} total={lessons.length} />
      <div
        ref={containerRef}
        className="flex overflow-x-hidden snap-x snap-mandatory"
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {lessons.map((lesson) => (
          <div
            key={lesson.id}
            className="w-full flex-shrink-0 snap-center px-4"
            tabIndex={-1}
          >
            <LessonCard
              lesson={lesson}
              completed={completed.has(lesson.id)}
              onCorrect={() => handleCorrect(lesson.id)}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        aria-label="Previous lesson"
        onClick={prev}
        className="hidden lg:flex items-center justify-center absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-10 h-10"
      >
        ◀
      </button>
      <button
        type="button"
        aria-label="Next lesson"
        onClick={next}
        className="hidden lg:flex items-center justify-center absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-10 h-10"
      >
        ▶
      </button>
    </div>
  );
}
