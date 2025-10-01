import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LessonDetailSkeleton from "../components/education/LessonDetailSkeleton";
import { useStrapiQuery } from "../hooks/useStrapiQuery";
import type { Lesson } from "../types/strapi";

export default function LessonDetailPage() {
  const { slug } = useParams();
  const { i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];

  const params = new URLSearchParams();
  params.set("filters[slug][$eq]", slug ?? "");
  params.set("locale", locale);

  const { data, isLoading, error } = useStrapiQuery<{ data: Lesson[] }>(
    "lesson",
    `/api/lessons?${params.toString()}`,
  );
  if (isLoading) return <LessonDetailSkeleton />;
  if (error) return <p className="mx-auto max-w-3xl px-4 py-16 text-center text-brand">Failed to load lesson.</p>;
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
