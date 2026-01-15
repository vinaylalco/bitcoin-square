import { Link } from "react-router-dom";
import ErrorState from "../components/ui/ErrorState";
import LoadingScreen from "../components/ui/LoadingScreen";
import { useStrapiQuery } from "../hooks/useStrapiQuery";
import type { Language } from "../types/strapi";

export default function LanguagesPage() {
  const { data, isLoading, error, refetch } = useStrapiQuery<{ data: Language[] }>("languages", "/api/languages");
  if (isLoading) return <LoadingScreen label="Loading languages..." />;
  if (error) {
    return (
      <ErrorState
        message="Failed to load languages."
        onRetry={() => {
          refetch();
        }}
      />
    );
  }
  const languages = Array.isArray(data?.data) ? data.data : [];
  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-12 sm:px-6">
      <header className="space-y-4 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">Languages</p>
        <h1 className="text-3xl font-black uppercase tracking-[0.16em] text-[var(--fg-default)] sm:text-4xl">
          Learn in your language
        </h1>
        <p className="max-w-2xl text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
          Choose a language to tailor lesson recommendations instantly. Cards adapt without slowing down the interface.
        </p>
      </header>
      <ul className="mt-10 space-y-3">
        {languages.map((lang) => (
          <li key={lang.id}>
            <Link
              className="group flex items-center justify-between rounded-2xl border border-brand/30 bg-[var(--bg-card)] px-6 py-4 text-sm font-semibold uppercase tracking-[0.32em] text-[var(--fg-default)] shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-brand hover:text-brand"
              to={`/lessons?language=${lang.attributes.code}`}
            >
              <span>{lang.attributes.name}</span>
              <span className="text-brand transition group-hover:translate-x-1">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
