import { useTranslation } from "react-i18next";
import Topic from "../components/lesson/Topic";
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

  return (
    <div className="px-4 sm:px-6 pb-24">
      {data && data.locale !== locale && (
        <p className="mb-4 text-sm text-neutral-500">
          Translation unavailable for this language, showing English.
        </p>
      )}
      <h1 className="text-2xl font-bold mb-6">{data?.title || "Education"}</h1>
      {data?.topics.map((t) => (
        <Topic key={t.name} topic={t} />
      ))}
      {isFetching && <div className="text-sm text-neutral-500">Loading…</div>}
    </div>
  );
}
