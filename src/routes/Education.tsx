import { useTranslation } from "react-i18next";
import CardStack from "../components/education/CardStack";
import type { LessonCardData } from "../components/education/types";
import { useLessonPlan } from "../hooks/useLessonPlan";

export default function Education() {
  const { i18n } = useTranslation();
  const locale = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
  const { data, isLoading, error, isFetching } = useLessonPlan(locale);

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

  const lessons: LessonCardData[] =
    data?.topics.flatMap((t) =>
      t.cards.map((c) => ({
        id: c.id,
        title: c.title,
        duration_min: c.duration_min || 0,
        content: c.content || "",
        objectives: c.objectives || [],
        quiz: {
          question: c.quiz?.question || "",
          type: (c.quiz?.type as any) || "reflection",
          options: c.quiz?.options || [],
          correct_answer: c.quiz?.correct_answer || "",
          style_note: c.quiz?.style_note,
        },
        topicName: t.name,
      }))
    ) || [];

  return (
    <div className="px-4 sm:px-6 pb-24">
      {data && data.locale !== locale && (
        <p className="mb-4 text-sm text-neutral-500">
          Translation unavailable for this language, showing English.
        </p>
      )}
      <h1 className="text-2xl font-bold mb-6">{data?.title || "Education"}</h1>
      <CardStack lessons={lessons} />
      {isFetching && <div className="text-sm text-neutral-500">Loading…</div>}
    </div>
  );
}
