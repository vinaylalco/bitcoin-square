import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import CourseCard from "../components/course/CourseCard";
import Modal from "../components/ui/Modal";
import LoadingSpinner from "../components/LoadingSpinner";
import {
  fetchContentCreatorProfiles,
  fetchCreatorProfileUserById,
  type CreatorProfileUser,
} from "../api/users";
import { useAuth } from "../context/AuthContext";
import {
  fetchContentCreatorCoursesByAuthorId,
  useContentCreatorCourses,
  useContentCreatorDraftCourses,
} from "../hooks/useContentCreatorCourses";
import { useStrapiQuery } from "../hooks/useStrapiQuery";
import {
  canViewCourse,
  normalizeContentCreatorCourse,
  normalizeLessonPlanCourse,
} from "../utils/courseNormalization";
import { resolveMedia } from "../lib/strapi";
import { resolveLocale } from "../utils/locale";
import { normalizeAvatarUrl } from "../utils/profileDefaults";
import { asArray } from "../utils/safeTypes";
import type { ContentCreatorCourse } from "../types/course";
import type { LessonPlan } from "../types/lesson-plan";

type LessonPlanResponse = {
  data?: unknown[];
};

type LessonPlanEntry = Record<string, unknown>;

const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const coerceBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
};

const toSlug = (title?: string): string =>
  title
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "";

const extractMediaUrl = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return undefined;
  const record = value as LessonPlanEntry;
  if (typeof record.url === "string") {
    return record.url;
  }
  const data = record.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      const resolved = extractMediaUrl(
        typeof item === "object" && item
          ? ((item as LessonPlanEntry).attributes as unknown) ?? item
          : item,
      );
      if (resolved) return resolved;
    }
  } else if (data && typeof data === "object") {
    return extractMediaUrl(((data as LessonPlanEntry).attributes as unknown) ?? data);
  }
  return undefined;
};

const normalizeLessonPlanEntry = (entry: unknown, locale: string): LessonPlan | null => {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const record = entry as LessonPlanEntry;
  const attributes =
    record.attributes && typeof record.attributes === "object"
      ? (record.attributes as LessonPlanEntry)
      : record;
  const course =
    (attributes.LessonPlanJSON as LessonPlanEntry | undefined)?.course ||
    (attributes.lessonPlanJSON as LessonPlanEntry | undefined)?.course ||
    {};
  const title =
    (course.name as string | undefined) ||
    (attributes.title as string | undefined) ||
    undefined;
  const slug =
    (attributes.slug as string | undefined) ||
    toSlug(title) ||
    (course.id != null ? String(course.id) : undefined) ||
    (record.id != null ? String(record.id) : undefined);
  const coverUrl = extractMediaUrl(attributes.coverImage);
  const price =
    parseNumber(attributes.price) ??
    parseNumber(attributes.Price) ??
    parseNumber(attributes.price_usd) ??
    parseNumber(course.price);
  const stripePriceId =
    (attributes.stripePriceId as string | undefined) ||
    (attributes.stripe_price_id as string | undefined) ||
    (course.stripePriceId as string | undefined);
  const stripeProductId =
    (attributes.stripeProductId as string | undefined) ||
    (attributes.stripe_product_id as string | undefined) ||
    (course.stripeProductId as string | undefined);
  const isPaid =
    coerceBoolean(
      attributes.isPaid ??
        attributes.is_paid ??
        course.isPaid ??
        course.is_paid,
    ) ?? false;
  const modules = Array.isArray(course.modules) ? course.modules : [];
  return {
    id: typeof record.id === "number" ? record.id : undefined,
    documentId: typeof record.documentId === "string" ? record.documentId : undefined,
    title,
    slug,
    description: typeof attributes.description === "string" ? attributes.description : undefined,
    coverImage: resolveMedia(coverUrl),
    modules,
    locale: typeof attributes.locale === "string" ? attributes.locale : locale,
    price,
    stripePriceId,
    stripeProductId,
    isPaid,
  };
};

const resolveYouTubeEmbedUrl = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!["youtube.com", "www.youtube.com"].includes(hostname)) {
    return null;
  }
  if (!parsed.pathname.startsWith("/embed/")) {
    return null;
  }
  return parsed.toString();
};

const getCreatorDisplayName = (profile: CreatorProfileUser | null): string =>
  profile?.screenName?.trim() || profile?.username?.trim() || "Creator";

const getCreatorShortDescription = (profile: CreatorProfileUser | null): string =>
  profile?.contentCreatorProfileDescription?.trim() || "Creator profile details coming soon.";

export default function CourseDirectory() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const refParam = searchParams.get("ref");
  const defaultTab = refParam ? "creator" : "education";
  const [activeTab, setActiveTab] = useState<"education" | "creator">(defaultTab);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfileUser | null>(null);
  const [creatorProfileStatus, setCreatorProfileStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [creatorCoursesStatus, setCreatorCoursesStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [creatorCourses, setCreatorCourses] = useState<ContentCreatorCourse[]>([]);
  const [creatorProfiles, setCreatorProfiles] = useState<CreatorProfileUser[]>([]);
  const [creatorProfilesStatus, setCreatorProfilesStatus] = useState<
    "idle" | "loading" | "error" | "success"
  >("idle");
  const [activeCreator, setActiveCreator] = useState<CreatorProfileUser | null>(null);
  const [creatorModalCourses, setCreatorModalCourses] = useState<ContentCreatorCourse[]>([]);
  const [creatorModalCoursesStatus, setCreatorModalCoursesStatus] = useState<
    "idle" | "loading" | "error" | "success"
  >("idle");
  const isCreator = user?.contentCreator === true;
  const locale = resolveLocale(i18n.language);
  const contentLocale = locale === "es" || locale === "id" ? locale : "en";
  const lessonPlanParams = new URLSearchParams();
  lessonPlanParams.set("filters[locale][$eq]", contentLocale);
  lessonPlanParams.append("populate[0]", "coverImage");
  const lessonPlanPath = `/api/lesson-plans?${lessonPlanParams.toString()}`;
  const {
    data: lessonPlansResponse,
    isLoading: lessonPlansLoading,
    error: lessonPlansError,
    refetch: refetchLessonPlans,
  } = useStrapiQuery<LessonPlanResponse>(
    `lesson-plans-${contentLocale}`,
    lessonPlanPath,
  );
  const {
    data: contentCreatorCourses,
    isLoading: contentCreatorLoading,
    refetch: refetchContentCreatorCourses,
  } = useContentCreatorCourses();
  const {
    data: draftCourses,
    isLoading: draftCoursesLoading,
    error: draftCoursesError,
    refetch: refetchDraftCourses,
  } = useContentCreatorDraftCourses();
  const description = t("courses.description");

  if (lessonPlansLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (lessonPlansError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <p className="text-brand">{t("courses.error")}</p>
        <button
          type="button"
          onClick={() => {
            refetchLessonPlans();
            refetchContentCreatorCourses();
            refetchDraftCourses();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-full border border-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:bg-brand hover:text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  const lessonPlanEntries = Array.isArray(lessonPlansResponse?.data)
    ? lessonPlansResponse.data
    : [];
  const normalizedLessonPlans = lessonPlanEntries
    .map((entry) => normalizeLessonPlanEntry(entry, contentLocale))
    .filter((course): course is LessonPlan => Boolean(course))
    .map((course) => normalizeLessonPlanCourse(course));
  const normalizedCreatorCourses = asArray(contentCreatorCourses).map((course) =>
    normalizeContentCreatorCourse(course),
  );
  const normalizedDraftCourses = asArray(draftCourses).map((course) =>
    normalizeContentCreatorCourse(course),
  );

  useEffect(() => {
    setActiveTab(refParam ? "creator" : "education");
  }, [refParam]);

  useEffect(() => {
    let active = true;
    setCreatorProfilesStatus("loading");

    fetchContentCreatorProfiles()
      .then((profiles) => {
        if (!active) {
          return;
        }
        setCreatorProfiles(Array.isArray(profiles) ? profiles : []);
        setCreatorProfilesStatus("success");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setCreatorProfiles([]);
        setCreatorProfilesStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeCreator?.id) {
      setCreatorModalCourses([]);
      setCreatorModalCoursesStatus("idle");
      return;
    }

    let active = true;
    setCreatorModalCoursesStatus("loading");

    fetchContentCreatorCoursesByAuthorId(activeCreator.id)
      .then((courses) => {
        if (!active) {
          return;
        }
        setCreatorModalCourses(Array.isArray(courses) ? courses : []);
        setCreatorModalCoursesStatus("success");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setCreatorModalCourses([]);
        setCreatorModalCoursesStatus("error");
      });

    return () => {
      active = false;
    };
  }, [activeCreator]);

  const refUserId = useMemo(() => {
    if (!refParam) {
      return null;
    }
    const parsed = Number(refParam);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return parsed;
  }, [refParam]);

  useEffect(() => {
    if (!refUserId) {
      setCreatorProfile(null);
      setCreatorProfileStatus("idle");
      setCreatorCourses([]);
      setCreatorCoursesStatus("idle");
      return;
    }

    let active = true;
    setCreatorProfileStatus("loading");

    fetchCreatorProfileUserById(refUserId)
      .then((profile) => {
        if (!active) {
          return;
        }
        setCreatorProfile(profile);
        setCreatorProfileStatus(profile ? "success" : "error");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setCreatorProfile(null);
        setCreatorProfileStatus("error");
      });

    return () => {
      active = false;
    };
  }, [refUserId]);

  useEffect(() => {
    if (!refUserId) {
      return;
    }

    let active = true;
    setCreatorCoursesStatus("loading");

    fetchContentCreatorCoursesByAuthorId(refUserId)
      .then((courses) => {
        if (!active) {
          return;
        }
        setCreatorCourses(Array.isArray(courses) ? courses : []);
        setCreatorCoursesStatus("success");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setCreatorCourses([]);
        setCreatorCoursesStatus("error");
      });

    return () => {
      active = false;
    };
  }, [refUserId]);

  const visibleCourses = [...normalizedLessonPlans, ...normalizedCreatorCourses].filter((course) =>
    canViewCourse(course, user),
  );
  const showPlaceholder = !contentCreatorLoading && visibleCourses.length === 0;
  const creatorProfileDescription = creatorProfile?.contentCreatorProfileDescription?.trim();
  const creatorEmbedUrl = resolveYouTubeEmbedUrl(creatorProfile?.contentCreatorYoutubeIntroEmbed);
  const creatorAvatarUrl = creatorProfile
    ? normalizeAvatarUrl(creatorProfile.avatarUrl, creatorProfile.username)
    : null;
  const creatorDisplayName = getCreatorDisplayName(creatorProfile);
  const publishedCreatorCourses = Array.isArray(creatorCourses) ? creatorCourses : [];
  const creatorProfilesList = Array.isArray(creatorProfiles) ? creatorProfiles : [];
  const activeCreatorAvatarUrl = activeCreator
    ? normalizeAvatarUrl(activeCreator.avatarUrl, activeCreator.username)
    : null;
  const activeCreatorLongDescription = activeCreator?.contentCreatorProfileDescription?.trim();
  const activeCreatorDisplayName = getCreatorDisplayName(activeCreator);
  const activeCreatorEmbedUrl = resolveYouTubeEmbedUrl(
    activeCreator?.contentCreatorYoutubeIntroEmbed,
  );
  const normalizedCreatorModalCourses = creatorModalCourses.map((course) =>
    normalizeContentCreatorCourse(course),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6">
      <div
        className="flex w-full max-w-sm items-center gap-2 rounded-full border border-neutral-200/70 bg-white/80 p-1 text-sm font-semibold uppercase tracking-[0.2em] text-neutral-600 shadow-sm dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:text-neutral-200"
        role="tablist"
        aria-label="Education tabs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "education"}
          className={`flex-1 rounded-full px-4 py-2 text-xs transition ${
            activeTab === "education"
              ? "bg-brand text-white shadow-sm"
              : "hover:text-brand"
          }`}
          onClick={() => setActiveTab("education")}
        >
          All Courses
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "creator"}
          className={`flex-1 rounded-full px-4 py-2 text-xs transition ${
            activeTab === "creator"
              ? "bg-brand text-white shadow-sm"
              : "hover:text-brand"
          }`}
          onClick={() => setActiveTab("creator")}
        >
          Content Creators
        </button>
      </div>
      {activeTab === "education" ? (
        <div>
          {refUserId && creatorProfileStatus === "success" && creatorProfile && (
            <section className="mt-10 rounded-3xl border border-neutral-200/70 bg-white/80 p-6 text-neutral-700 shadow-sm dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:text-neutral-200">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {creatorAvatarUrl && (
                  <div className="h-16 w-16 overflow-hidden rounded-full border border-neutral-200/70 bg-white/70 shadow-sm dark:border-neutral-800/70 dark:bg-neutral-900/70">
                    <img
                      src={creatorAvatarUrl}
                      alt={creatorDisplayName}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.4em] text-brand">
                    Creator
                  </p>
                  <p className="text-2xl font-bold text-[var(--fg-default)]">
                    {creatorDisplayName}
                  </p>
                </div>
              </div>
              {creatorProfileDescription && (
                <p className="mt-4 text-sm text-[var(--fg-muted)]">
                  {creatorProfileDescription}
                </p>
              )}
              {creatorEmbedUrl && (
                <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200/70 bg-black shadow-sm dark:border-neutral-800/70">
                  <iframe
                    src={creatorEmbedUrl}
                    title={`${creatorDisplayName} introduction`}
                    className="h-64 w-full md:h-80"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              )}
              <h2 className="mt-6 text-xl font-bold text-[var(--fg-default)]">
                {creatorDisplayName}
                {"'s Live Courses"}
              </h2>
              {creatorCoursesStatus === "loading" && (
                <p className="mt-4 text-sm text-[var(--fg-muted)]">Loading courses...</p>
              )}
              {creatorCoursesStatus === "success" && publishedCreatorCourses.length === 0 && (
                <p className="mt-4 text-sm text-[var(--fg-muted)]">
                  This creator is in the process of creating their course please check back soon
                </p>
              )}
              {creatorCoursesStatus === "success" && publishedCreatorCourses.length > 0 && (
                <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {publishedCreatorCourses.map((course) => (
                    <CourseCard key={String(course.id || course.slug)} course={course} />
                  ))}
                </div>
              )}
            </section>
          )}
          <header className="mt-10 space-y-4 text-center sm:text-left">
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
      ) : (
        <div className="mt-10 space-y-6">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">
              Content Creators
            </p>
            <h2 className="text-2xl font-bold uppercase tracking-[0.12em] text-[var(--fg-default)]">
              Meet the creators
            </h2>
            <p className="text-sm text-[var(--fg-muted)]">
              Browse the creators sharing their latest courses and insights.
            </p>
          </header>
          <div className="rounded-3xl border border-neutral-200/70 bg-white/80 p-8 text-neutral-700 shadow-sm dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:text-neutral-200">
            {creatorProfilesStatus === "loading" && (
              <p className="text-sm text-[var(--fg-muted)]">Loading content creators...</p>
            )}
            {creatorProfilesStatus === "error" && (
              <p className="text-sm text-[var(--fg-muted)]">
                Unable to load creator profiles right now.
              </p>
            )}
            {creatorProfilesStatus === "success" && creatorProfilesList.length === 0 && (
              <p className="text-sm text-[var(--fg-muted)]">
                No content creators are available yet. Check back soon.
              </p>
            )}
            {creatorProfilesStatus === "success" && creatorProfilesList.length > 0 && (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {creatorProfilesList.map((profile) => {
                  const avatarUrl = normalizeAvatarUrl(profile.avatarUrl, profile.username);
                  const shortDescription = getCreatorShortDescription(profile);
                  const displayName = getCreatorDisplayName(profile);
                  return (
                    <article
                      key={profile.id}
                      onClick={() => setActiveCreator(profile)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setActiveCreator(profile);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="flex h-full cursor-pointer flex-col gap-4 rounded-2xl border border-neutral-200/70 bg-white/70 p-6 text-left shadow-sm transition hover:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 dark:border-neutral-800/70 dark:bg-neutral-900/70"
                    >
                      <div className="flex items-center gap-4">
                        {avatarUrl ? (
                          <div className="h-12 w-12 overflow-hidden rounded-full border border-neutral-200/70 bg-white/70 shadow-sm dark:border-neutral-800/70 dark:bg-neutral-900/70">
                            <img
                              src={avatarUrl}
                              alt={displayName}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-200/70 bg-neutral-100 text-sm font-semibold uppercase text-neutral-500 shadow-sm dark:border-neutral-800/70 dark:bg-neutral-800 dark:text-neutral-200">
                            {displayName.slice(0, 1)}
                          </div>
                        )}
                        <div>
                          <p className="text-base font-semibold text-[var(--fg-default)]">
                            {displayName}
                          </p>
                          <p className="text-xs uppercase tracking-[0.3em] text-brand">
                            Creator
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-[var(--fg-muted)]">
                        {shortDescription}
                      </p>
                    </article>
                  );
                })}
              </div>
              )}
          </div>
        </div>
      )}
      <Modal
        open={Boolean(activeCreator)}
        onClose={() => setActiveCreator(null)}
        labelledBy="creator-modal-title"
        describedBy={activeCreatorLongDescription ? "creator-modal-description" : undefined}
      >
        {activeCreator && (
          <div className="max-h-[85vh] overflow-y-auto rounded-3xl border border-neutral-200/70 bg-white p-6 text-neutral-700 shadow-xl dark:border-neutral-800/70 dark:bg-neutral-900 dark:text-neutral-200 sm:p-8">
            {activeCreatorAvatarUrl && (
              <div className="mb-6 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white/70 shadow-sm dark:border-neutral-800/70 dark:bg-neutral-900/70">
                <img
                  src={activeCreatorAvatarUrl}
                  alt={activeCreatorDisplayName}
                  className="h-48 w-full object-cover sm:h-56"
                  loading="lazy"
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {!activeCreatorAvatarUrl ? (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-neutral-200/70 bg-neutral-100 text-base font-semibold uppercase text-neutral-500 shadow-sm dark:border-neutral-800/70 dark:bg-neutral-800 dark:text-neutral-200">
                    {activeCreatorDisplayName.slice(0, 1)}
                  </div>
                ) : null}
                <div>
                  <p
                    id="creator-modal-title"
                    className="text-xl font-bold text-[var(--fg-default)]"
                  >
                    {activeCreatorDisplayName}
                  </p>
                  <p className="text-xs uppercase tracking-[0.3em] text-brand">Creator</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveCreator(null)}
                className="rounded-full border border-neutral-200/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600 transition hover:border-brand/60 hover:text-brand dark:border-neutral-800/70 dark:text-neutral-200"
              >
                Close
              </button>
            </div>
            {activeCreatorLongDescription && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-brand">
                  About
                </h3>
                <p id="creator-modal-description" className="mt-2 text-sm text-[var(--fg-muted)]">
                  {activeCreatorLongDescription}
                </p>
              </div>
            )}
            {activeCreatorEmbedUrl && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-brand">
                  Intro Video
                </h3>
                <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200/70 bg-black shadow-sm dark:border-neutral-800/70">
                  <iframe
                    src={activeCreatorEmbedUrl}
                    title={`${activeCreatorDisplayName} introduction`}
                    className="h-64 w-full md:h-72"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              </div>
            )}
            <div className="mt-8">
              <h3 className="text-lg font-bold text-[var(--fg-default)]">
                {activeCreatorDisplayName}
                {"'s courses"}
              </h3>
              {creatorModalCoursesStatus === "loading" && (
                <p className="mt-3 text-sm text-[var(--fg-muted)]">Loading courses...</p>
              )}
              {creatorModalCoursesStatus === "error" && (
                <p className="mt-3 text-sm text-[var(--fg-muted)]">
                  Unable to load courses for this creator.
                </p>
              )}
              {creatorModalCoursesStatus === "success" && normalizedCreatorModalCourses.length === 0 && (
                <p className="mt-3 text-sm text-[var(--fg-muted)]">
                  No published courses yet. Check back soon.
                </p>
              )}
              {creatorModalCoursesStatus === "success" && normalizedCreatorModalCourses.length > 0 && (
                <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {normalizedCreatorModalCourses.map((course) => (
                    <CourseCard key={String(course.id || course.slug)} course={course} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
