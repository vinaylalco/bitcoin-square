import { Link, useSearchParams } from "react-router-dom";
import LessonGridSkeleton from "../components/education/LessonGridSkeleton";
import { useStrapiQuery } from "../hooks/useStrapiQuery";
import type { Lesson } from "../types/strapi";
import { asArray } from "../utils/safeTypes";

export default function LessonsPage() {
  const [params] = useSearchParams();
  const lang = params.get("language");
  const level = params.get("level");
  const filters = [] as string[];
  if (lang) filters.push(`filters[language][code][$eq]=${lang}`);
  if (level) filters.push(`filters[level][$eq]=${level}`);
  const query = filters.length ? `?${filters.join("&")}` : "";

  const { data, isLoading, error } = useStrapiQuery<{ data: Lesson[] }>("lessons", `/api/lessons${query}`);
  if (isLoading) return <LessonGridSkeleton />;
  if (error) return <p className="mx-auto max-w-3xl px-4 py-16 text-center text-brand">Failed to load lessons.</p>;

  const lessons = asArray(data?.data);
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6">
      <header className="space-y-4 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">Lessons</p>
        <h1 className="text-3xl font-black uppercase tracking-[0.16em] text-[var(--fg-default)] sm:text-4xl">
          Dive into Bitcoin fundamentals
        </h1>
        <p className="max-w-2xl text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
          Every lesson card carries red-accent borders, tactile hover states, and crisp typography. Stay focused on the essentials without scrolling through fluff.
        </p>
        {(lang || level) && (
          <div className="inline-flex flex-wrap gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-brand">
            {lang && <span className="rounded-full border border-brand px-3 py-1">Language: {lang.toUpperCase()}</span>}
            {level && <span className="rounded-full border border-brand px-3 py-1">Level: {level}</span>}
          </div>
        )}
      </header>
      {lessons.length === 0 ? (
        <p className="mt-16 text-center text-sm font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
          No lessons found.
        </p>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {lessons.map((lesson) => {
            const attrs = lesson.attributes;
            const language = attrs.language?.data?.attributes?.code;
            return (
              <Link
                key={lesson.id}
                to={`/lessons/${attrs.slug}`}
                className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-brand/30 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:border-brand hover:shadow-[0_35px_90px_rgba(169,21,255,0.35)]"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-brand/10 via-transparent to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
                <div className="relative flex flex-1 flex-col gap-4">
                  <div className="flex items-center justify-between text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-brand">
                    <span>{attrs.level || "Self-paced"}</span>
                    {language && <span>{language.toUpperCase()}</span>}
                  </div>
                  <h2 className="text-lg font-bold uppercase tracking-[0.2em] text-[var(--fg-default)]">
                    {attrs.title}
                  </h2>
                  {attrs.summary && (
                    <p className="flex-1 text-sm leading-relaxed text-[var(--fg-muted)]">
                      {attrs.summary}
                    </p>
                  )}
                  <div className="mt-auto inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
                    View Lesson
                    <span aria-hidden className="transition group-hover:translate-x-1">→</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
