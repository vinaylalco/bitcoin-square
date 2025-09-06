import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import LessonSlider from "../components/education/LessonSlider";
import { useLessonPlan } from "../hooks/useLessonPlan";
import type { Card } from "../types/lesson-plan";

export default function Education() {
  const { i18n } = useTranslation();
  const locale = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
  const { data, isLoading, error, isFetching } = useLessonPlan(locale);
  const lessons = useMemo<Card[]>(
    () => (data ? data.topics.flatMap((t) => t.cards) : []),
    [data],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const handleComplete = (id: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // TODO: sync completed lessons to Strapi if persistence is required
  };

  if (isLoading && !data) {
    return (
      <div className="p-4 space-y-2 animate-pulse">
        <div className="h-6 bg-neutral-200 rounded w-1/3" />
        <div className="h-4 bg-neutral-200 rounded w-full" />
        <div className="h-4 bg-neutral-200 rounded w-5/6" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-brand">Failed to load lesson plan.</div>;
  }

  return (
    <div className="px-4 sm:px-6 pb-24">
      {data && data.locale !== locale && (
        <p className="mb-4 text-sm text-neutral-500">
          Translation unavailable for this language, showing English.
        </p>
      )}
      <h1 className="text-2xl font-bold mb-6">{data?.title || "Education"}</h1>
      <LessonSlider
        lessons={lessons}
        currentIndex={currentIndex}
        setCurrentIndex={setCurrentIndex}
        completed={completed}
        onComplete={handleComplete}
      />
      {isFetching && <div className="text-sm text-neutral-500">Loading…</div>}
    </div>
  );
}
