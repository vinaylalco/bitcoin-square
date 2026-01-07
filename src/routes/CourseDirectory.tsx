import { useTranslation } from "react-i18next";
import CourseCard from "../components/course/CourseCard";
import CourseDirectorySkeleton from "../components/course/CourseDirectorySkeleton";
import { useAuth } from "../context/AuthContext";
import { useContentCreatorCourses } from "../hooks/useContentCreatorCourses";
import { useLessonPlans } from "../hooks/useLessonPlans";
import {
  canViewCourse,
  normalizeContentCreatorCourse,
  normalizeLessonPlanCourse,
} from "../utils/courseNormalization";
import { resolveLocale } from "../utils/locale";

export default function CourseDirectory() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const locale = resolveLocale(i18n.language);
  const contentLocale = locale === "es" || locale === "id" ? locale : "en";
  const {
    data: lessonPlans,
    isLoading: lessonPlansLoading,
    error: lessonPlansError,
  } = useLessonPlans(contentLocale);
  const {
    data: contentCreatorCourses,
    isLoading: contentCreatorLoading,
  } = useContentCreatorCourses();
  const description = t("courses.description");

  if (lessonPlansLoading && !lessonPlans) {
    return <CourseDirectorySkeleton />;
  }

  if (lessonPlansError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-brand">
        {t("courses.error")}
      </div>
    );
  }

  const normalizedLessonPlans = (lessonPlans || []).map((course) =>
    normalizeLessonPlanCourse(course),
  );
  const normalizedCreatorCourses = (contentCreatorCourses || []).map((course) =>
    normalizeContentCreatorCourse(course),
  );
  const visibleCourses = [...normalizedLessonPlans, ...normalizedCreatorCourses].filter((course) =>
    canViewCourse(course, user),
  );
  const showPlaceholder = !contentCreatorLoading && visibleCourses.length === 0;

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
        {visibleCourses.length > 0 ? (
          visibleCourses.map((course) => (
            <CourseCard key={String(course.id || course.slug)} course={course} />
          ))
        ) : showPlaceholder ? (
          <div className="rounded-3xl border border-neutral-200/70 bg-white/80 p-8 text-center text-sm text-neutral-600 dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:text-neutral-300 md:col-span-2 lg:col-span-3">
            {t("courses.empty", { defaultValue: "No lessons available." })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
