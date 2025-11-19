import { useTranslation } from "react-i18next";
import CourseCard from "../components/course/CourseCard";
import CourseDirectorySkeleton from "../components/course/CourseDirectorySkeleton";
import { useLessonPlans } from "../hooks/useLessonPlans";
import { resolveLocale } from "../utils/locale";

export default function CourseDirectory() {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const contentLocale = locale === "es" || locale === "id" ? locale : "en";
  const { data, isLoading, error } = useLessonPlans(contentLocale);
  const description = t("courses.description");

  if (isLoading && !data) {
    return <CourseDirectorySkeleton />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-brand">
        {t("courses.error")}
      </div>
    );
  }

  const courses = data || [];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6">
      <header className="space-y-4 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">{t("courses.label")}</p>
        <h1 className="text-3xl font-black uppercase tracking-[0.16em] text-[var(--fg-default)] sm:text-4xl">
          {t("courses.title")}
        </h1>
        {description && (
          <p className="text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
            {description}
          </p>
        )}
      </header>
      <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <CourseCard key={String(course.id || course.slug)} course={course} />
        ))}
      </div>
    </div>
  );
}
