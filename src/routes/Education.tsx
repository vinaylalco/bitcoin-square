import React, { useState } from "react";
import { useLessons } from "../components/education/useLessons";
import CardStack from "../components/education/CardStack";

export default function Education() {
  const { lessons, loading, error } = useLessons();
  const [points, setPoints] = useState(0);
  const [maxIndexReached, setMaxIndexReached] = useState(0);
  const [animate, setAnimate] = useState(false);

  const handleAdvance = (newIndex: number) => {
    if (newIndex > maxIndexReached) {
      const newlyCompleted = newIndex - maxIndexReached;
      setPoints((p) => p + newlyCompleted * 10);
      setMaxIndexReached(newIndex);
      setAnimate(true);
      setTimeout(() => setAnimate(false), 500);
    }
  };

  if (loading) return <div className="p-4">Loading lessons…</div>;
  if (error) return <div className="p-4 text-brand">Failed to load lessons: {error}</div>;

  return (
    <div className="px-0 sm:px-0 pb-24"> {/* padding so bottom nav doesn't cover content */}
      {/* Points badge with bounce */}
      <div className="px-4 sm:px-6 mb-2">
        <span
          className={`inline-flex items-center gap-2 text-sm rounded-full border border-neutral-200 dark:border-neutral-700 px-3 py-1 bg-white dark:bg-neutral-800 transition-transform ${
            animate ? "scale-110" : "scale-100"
          }`}
        >
          <span className="inline-block h-3 w-3 bg-brand rounded-full" />
          <strong>{points}</strong> points
        </span>
      </div>

      <CardStack lessons={lessons} onAdvance={handleAdvance} />
    </div>
  );
}
