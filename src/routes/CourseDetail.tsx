import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import Slider from "../components/lesson/Slider";
import { useLessonPlan } from "../hooks/useLessonPlan";
import type { LessonCard } from "../types/lesson-plan";

export default function CourseDetail() {
  const { i18n } = useTranslation();
  const { slug = "" } = useParams();
  const locale = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
  const { data, isLoading, error, isFetching } = useLessonPlan(locale, slug);

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
    if (error.message === "Not Found") {
      return <div className="p-4">Course not found.</div>;
    }
    return <div className="p-4 text-brand">Failed to load lesson plan.</div>;
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
    <div className="px-4 sm:px-6 pb-24">
      {data && data.locale !== locale && (
        <p className="mb-4 text-sm text-neutral-500">
          Translation unavailable for this language, showing English.
        </p>
      )}
      <h1 className="text-2xl font-bold mb-6">{data?.title || "Education"}</h1>
      {cards.length > 0 && (
        <Slider
          cards={cards}
          modules={modules}
          courseTitle={data?.title || "Education"}
          lessonSlug={data?.slug || slug}
        />
      )}
      {isFetching && <div className="text-sm text-neutral-500">Loading…</div>}
    </div>
  );
}
