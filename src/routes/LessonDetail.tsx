import { useParams } from "react-router-dom";
import ErrorState from "../components/ui/ErrorState";
import LoadingScreen from "../components/ui/LoadingScreen";
import { useStrapiQuery } from "../hooks/useStrapiQuery";
import type { Lesson } from "../types/strapi";

export default function LessonDetailPage() {
  const { slug } = useParams();
  const { data, isLoading, error, refetch } = useStrapiQuery<{ data: Lesson[] }>("lesson", `/api/lessons?filters[slug][$eq]=${slug}`);
  if (isLoading) return <LoadingScreen label="Loading lesson..." />;
  if (error) {
    return (
      <ErrorState
        message="Failed to load lesson."
        onRetry={() => {
          refetch();
        }}
      />
    );
  }
  const lesson = data?.data?.[0];
  if (!lesson) return <p className="mx-auto max-w-3xl px-4 py-16 text-center text-[var(--fg-muted)]">Lesson not found.</p>;
  const attrs = lesson.attributes;
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-16">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">Lesson</p>
        <h1 className="text-3xl font-black uppercase tracking-[0.14em] text-[var(--fg-default)]">
          {attrs.title}
        </h1>
        {attrs.summary && <p className="text-sm font-medium leading-relaxed text-[var(--fg-muted)]">{attrs.summary}</p>}
      </header>
      {attrs.content && (
        <div className="prose prose-neutral max-w-none rounded-3xl border border-brand/20 bg-[var(--bg-card)] px-6 py-8 shadow-[var(--shadow-soft)] transition hover:border-brand dark:prose-invert" dangerouslySetInnerHTML={{ __html: attrs.content }} />
      )}
    </article>
  );
}
