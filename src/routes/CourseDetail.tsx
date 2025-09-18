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
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-12 sm:px-6">
      <div className="overflow-hidden rounded-3xl border border-brand/30 bg-[var(--bg-card)] shadow-[var(--shadow-soft)]">
        <div className="relative overflow-hidden bg-gradient-to-br from-black via-neutral-900 to-neutral-800 px-6 py-12 text-white sm:px-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.55),_transparent_60%)] opacity-80" />
          <div className="relative z-10 space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand/80">Immersive Course</p>
            <h1 className="text-3xl font-black uppercase tracking-[0.14em] sm:text-4xl">
              {data?.title || "Education"}
            </h1>
            {data && data.locale !== locale && (
              <p className="max-w-xl text-sm font-medium text-white/70">
                Translation unavailable for this language, showing English.
              </p>
            )}
            <div className="flex flex-wrap gap-3 text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-white/70">
              <span className="rounded-full border border-white/30 px-4 py-1">{modules.length} Modules</span>
              <span className="rounded-full border border-white/30 px-4 py-1">Guided Learning</span>
            </div>
          </div>
        </div>

        <div className="space-y-6 bg-[var(--bg-card)] px-4 py-10 sm:px-10">
          {cards.length > 0 ? (
            <div className="overflow-hidden rounded-3xl border border-brand/20 bg-[var(--bg-card)] shadow-[var(--shadow-soft)]">
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
