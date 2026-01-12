import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import CourseCard from "../components/course/CourseCard";
import CourseDirectorySkeleton from "../components/course/CourseDirectorySkeleton";
import { useAuth } from "../context/AuthContext";
import {
  useContentCreatorCourses,
  useContentCreatorDraftCourses,
} from "../hooks/useContentCreatorCourses";
import { useLessonPlans } from "../hooks/useLessonPlans";
import {
  canViewCourse,
  normalizeContentCreatorCourse,
  normalizeLessonPlanCourse,
} from "../utils/courseNormalization";
import { resolveLocale } from "../utils/locale";
import { asArray } from "../utils/safeTypes";

export default function CourseDirectory() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isCreator = user?.contentCreator === true;
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
  const {
    data: draftCourses,
    isLoading: draftCoursesLoading,
    error: draftCoursesError,
  } = useContentCreatorDraftCourses();
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

  const normalizedLessonPlans = asArray(lessonPlans).map((course) =>
    normalizeLessonPlanCourse(course),
  );
  const normalizedCreatorCourses = asArray(contentCreatorCourses).map((course) =>
    normalizeContentCreatorCourse(course),
  );
  const normalizedDraftCourses = asArray(draftCourses).map((course) =>
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
      {isCreator && (
        <section className="mt-14">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold uppercase tracking-[0.12em] text-[var(--fg-default)]">
              {t("courses.drafts.title")}
            </h2>
            <p className="text-sm text-[var(--fg-muted)]">{t("courses.drafts.helper")}</p>
          </div>
          <div className="mt-6 space-y-4">
            {draftCoursesLoading && (
              <p className="text-sm text-neutral-500">{t("courses.drafts.loading")}</p>
            )}
            {draftCoursesError && (
              <p className="text-sm text-red-500">{t("courses.drafts.error")}</p>
            )}
            {!draftCoursesLoading && normalizedDraftCourses.length === 0 && (
              <p className="text-sm text-neutral-500">{t("courses.drafts.empty")}</p>
            )}
            {normalizedDraftCourses.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {normalizedDraftCourses.map((course) => {
                  const courseId =
                    course.documentId ?? course.id ?? course.slug ?? null;
                  if (!courseId) {
                    return null;
                  }
                  const title = course.title?.trim() || t("courses.drafts.untitled");
                  return (
                    <article
                      key={String(courseId)}
                      className="flex h-full flex-col justify-between rounded-3xl border border-neutral-200/70 bg-white/80 p-6 text-left text-neutral-700 shadow-sm transition hover:border-brand/50 dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:text-neutral-200"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-[var(--fg-default)]">{title}</h3>
                        <span className="rounded-full border border-amber-400/60 bg-amber-500/10 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-amber-600">
                          {t("courses.drafts.badge")}
                        </span>
                      </div>
                      {course.description && (
                        <p className="mt-3 text-sm text-[var(--fg-muted)]">
                          {course.description}
                        </p>
                      )}
                      <div className="mt-5">
                        <Link
                          to={`/creator/courses/${courseId}/edit`}
                          className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600 transition hover:border-brand hover:text-brand dark:border-neutral-700 dark:text-neutral-200"
                        >
                          {t("courses.drafts.edit")}
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
