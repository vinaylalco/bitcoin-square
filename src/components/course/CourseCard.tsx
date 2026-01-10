import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import BuyCourseButton from "./BuyCourseButton";
import type { LessonPlan } from "../../types/lesson-plan";
import { formatCurrency } from "../../utils/currency";

interface Props {
  course: LessonPlan;
}

export default function CourseCard({ course }: Props) {
  const modules = Array.isArray(course.modules) ? course.modules : [];
  const moduleCount = modules.length;
  const slug = course.slug || (course.id != null ? String(course.id) : "");
  const isPaid = course.isPaid ?? false;
  const hasPrice = course.price !== undefined && course.price !== null;
  const formattedPrice = hasPrice ? formatCurrency(course.price) : "";
  const priceLabel =
    formattedPrice && formattedPrice.length > 0
      ? formattedPrice
      : "Contact us";
  const canPurchase = Boolean(
    isPaid && course.stripePriceId && typeof course.id === "number",
  );
  return (
    <Link
      to={`/education/${slug}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-brand/30 bg-[var(--bg-card)] shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:border-brand hover:shadow-[0_45px_90px_rgba(169,21,255,0.35)]"
    >
      {course.coverImage ? (
        <div className="relative overflow-hidden">
          <img
            src={course.coverImage}
            alt={course.title || "Course cover"}
            className="h-48 w-full object-cover transition duration-700 group-hover:scale-110"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-60 transition duration-300 group-hover:opacity-80" />
          <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-brand/50 bg-black/60 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.38em] text-white">
            {moduleCount} {moduleCount === 1 ? "Module" : "Modules"}
          </span>
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center border-b border-brand/20 bg-gradient-to-br from-brand/5 via-transparent to-transparent text-xs uppercase tracking-[0.38em] text-brand/70">
          Visual coming soon
        </div>
      )}
      <div className="relative flex flex-1 flex-col gap-4 p-6">
        <div className="space-y-3">
          <h3 className="text-lg font-bold uppercase tracking-[0.18em] text-[var(--fg-default)]">
            {course.title}
          </h3>
          {course.description && (
            <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
              {course.description}
            </p>
          )}
        </div>
        <div className="mt-auto space-y-4">
          {isPaid && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
                {priceLabel}
              </span>
              {canPurchase ? (
                <BuyCourseButton
                  lessonPlanId={course.id}
                  stripePriceId={course.stripePriceId}
                  className="px-5 py-2 text-[0.55rem]"
                  label="Buy Course"
                />
              ) : (
                <span className="text-[0.55rem] font-semibold uppercase tracking-[0.32em] text-brand">
                  Checkout unavailable
                </span>
              )}
            </div>
          )}
          <div className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition group-hover:translate-x-1">
            View Course
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}
