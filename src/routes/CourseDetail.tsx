import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import Slider from "../components/lesson/Slider";
import CourseDetailSkeleton from "../components/course/CourseDetailSkeleton";
import { useLessonPlan } from "../hooks/useLessonPlan";
import type { LessonCard } from "../types/lesson-plan";

export default function CourseDetail() {
  const { i18n } = useTranslation();
  const { slug = "" } = useParams();
  const locale = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
  const { data, isLoading, error, isFetching } = useLessonPlan(locale, slug);

  if (isLoading && !data) {
    return <CourseDetailSkeleton />;
  }

  if (error) {
    if (error.message === "Not Found") {
      return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-[var(--fg-muted)]">Course not found.</div>;
    }
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-brand">Failed to load lesson plan.</div>;
  }

  const modules = data?.modules ?? [];
  const cards: LessonCard[] =
    modules.flatMap((m, moduleIndex) =>
      m.topics.flatMap((t, topicIndex) =>
        t.cards.map((c, cardIndex) => ({
          ...c,
          topicId: t.id,
          topicName: t.name,
          moduleId: m.id,
          moduleName: m.name,
          sourceCardId: c.id,
          isLastInTopic: cardIndex === t.cards.length - 1,
          isLastInModule:
            moduleIndex === modules.length - 1 &&
            topicIndex === m.topics.length - 1 &&
            cardIndex === t.cards.length - 1,
        })),
      ),
    ) ?? [];

  return (
    <div className="w-full pb-24">
      <div className="w-full overflow-hidden bg-[var(--bg-card)] shadow-[var(--shadow-soft)]">
        <div className="space-y-6 bg-[var(--bg-card)] px-4 py-10 sm:px-10">
<<<<<<< Updated upstream
          <div className="relative overflow-hidden rounded-3xl border border-brand/25 bg-gradient-to-br from-white via-brand/20 to-brand/10 p-8 text-neutral-900 shadow-[0_35px_120px_rgba(169,21,255,0.18)] transition-colors duration-500 dark:border-brand/40 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-900 dark:text-neutral-50">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(169,21,255,0.35),_transparent_60%)] opacity-70 transition-opacity duration-500" />
=======
          {/*<div className="relative overflow-hidden rounded-3xl border border-brand/25 bg-gradient-to-br from-white via-red-100/40 to-red-200/40 p-8 text-neutral-900 shadow-[0_35px_120px_rgba(239,68,68,0.18)] transition-colors duration-500 dark:border-brand/40 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-900 dark:text-neutral-50">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.35),_transparent_60%)] opacity-70 transition-opacity duration-500" />
>>>>>>> Stashed changes
            <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">Immersive Course</p>
                <h1 className="text-3xl font-black uppercase tracking-[0.14em] sm:text-4xl">
                  {data?.title || "Education"}
                </h1>
                {data && data.locale !== locale && (
                  <p className="max-w-xl text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Translation unavailable for this language, showing English.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-3 text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-neutral-700 dark:text-neutral-200">
                <span className="rounded-full border border-neutral-900/20 px-4 py-1 shadow-sm transition duration-300 dark:border-white/20">
                  {modules.length} Modules
                </span>
                <span className="rounded-full border border-neutral-900/20 px-4 py-1 shadow-sm transition duration-300 dark:border-white/20">
                  Guided Learning
                </span>
              </div>
            </div>
          </div>*/}
          {cards.length > 0 ? (
            <div className="overflow-hidden bg-[var(--bg-card)] shadow-[var(--shadow-soft)]">
              <Slider
                cards={cards}
                modules={modules}
                courseTitle={data?.title || "Education"}
                lessonSlug={data?.slug || slug}
              />
            </div>
          ) : (
            <p className="px-6 py-12 text-center text-sm font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
              Lessons coming soon.
            </p>
          )}
          {isFetching && (
            <p className="text-center text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
              Updating course…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
