import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { LessonPlan } from "../../types/lesson-plan";

interface Props {
  course: LessonPlan;
}

function navigateTo(url: string) {
  if (!url) return;
  if (typeof window === "undefined") return;
  if (/^https?:\/\//i.test(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = url;
}

export default function CourseCard({ course }: Props) {
  const slug = course.slug || course.id;
  const isPaid = course.isPaid === true;
  const rawPrice = course.price?.trim();
  const priceLabel =
    isPaid && rawPrice
      ? rawPrice.startsWith("$")
        ? rawPrice
        : `$${rawPrice}`
      : undefined;
  const purchaseUrl = course.purchaseUrl?.trim();
  const purchaseLabel = course.purchaseLabel?.trim() || "Buy course";
  const showPurchaseButton = isPaid;
  const showPurchasePanel = Boolean(isPaid && (priceLabel || showPurchaseButton));

  return (
    <article className="relative">
      <Link
        to={`/education/${slug}`}
        className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-brand/30 bg-[var(--bg-card)] shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:border-brand hover:shadow-[0_45px_90px_rgba(169,21,255,0.35)]"
      >
        {course.coverImage && (
          <div className="relative overflow-hidden">
            <img
              src={course.coverImage}
              alt={course.title || "Course cover"}
              className="h-48 w-full object-cover transition duration-700 group-hover:scale-110"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-60 transition duration-300 group-hover:opacity-80" />
          </div>
        )}
        <div className="relative flex flex-1 flex-col gap-4 p-6">
          <span className="sr-only">{course.title}</span>
          {course.description && (
            <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
              {course.description}
            </p>
          )}
          <div className="mt-auto inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition group-hover:translate-x-1">
            View Course
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </Link>
      {showPurchasePanel && (
        <div className="pointer-events-none absolute right-6 top-6 z-10 w-full max-w-sm space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-6 shadow-[var(--shadow-soft)]">
          {priceLabel && (
            <p className="pointer-events-none text-right text-xl font-semibold uppercase tracking-[0.28em] text-brand">
              {priceLabel}
            </p>
          )}
          {showPurchaseButton && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (!purchaseUrl) return;
                navigateTo(purchaseUrl);
              }}
              className="pointer-events-auto inline-flex w-full items-center justify-center rounded-full bg-brand px-5 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-white shadow-[0_20px_45px_rgba(169,21,255,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_60px_rgba(169,21,255,0.4)]"
            >
              {purchaseLabel}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
