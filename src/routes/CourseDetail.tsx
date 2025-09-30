import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import Slider from "../components/lesson/Slider";
import CourseDetailSkeleton from "../components/course/CourseDetailSkeleton";
import { useLessonPlan } from "../hooks/useLessonPlan";
import type { Card, LessonCard, Module, Topic } from "../types/lesson-plan";
import { useAuth } from "../context/AuthContext";

type UnknownRecord = Record<string, unknown>;
type RichCard = Card & UnknownRecord;
type VideoCandidate = { key: string; value: string };

const LOCALE_VIDEO_KEYS: Record<"en" | "es", string[]> = {
  en: [
    "youtube_video_link_en",
    "video_link_en",
    "youtube_en",
    "youtubeLinkEn",
    "youtube_url_en",
    "videoLinkEn",
    "video_en",
    "videoEn",
    "videoUrlEn",
  ],
  es: [
    "youtube_video_link_es",
    "video_link_es",
    "youtube_es",
    "youtubeLinkEs",
    "youtube_url_es",
    "videoLinkEs",
    "video_es",
    "videoEs",
    "videoUrlEs",
  ],
};

function normalizeLocale(locale?: string): "en" | "es" | undefined {
  if (!locale) return undefined;
  const lower = locale.toLowerCase();
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("en")) return "en";
  return undefined;
}

function standardizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

function keyMatchesLocale(key: string, locale: "en" | "es"): boolean {
  const normalized = standardizeKey(key);
  if (locale === "en") {
    return (
      normalized.includes("english") ||
      normalized.endsWith("_en") ||
      normalized.includes("_en_") ||
      normalized.startsWith("en_")
    );
  }

  return (
    normalized.includes("spanish") ||
    normalized.endsWith("_es") ||
    normalized.includes("_es_") ||
    normalized.startsWith("es_")
  );
}

function buildPreferredVideoKeys(locale?: "en" | "es"): string[] {
  const baseKeys = [
    "videoUrl",
    "youtube",
    "youtube_video_link",
    "youtubeLink",
    "youtube_url",
    "video_link",
    "videoLink",
  ];

  if (!locale) {
    return Array.from(
      new Set([
        ...LOCALE_VIDEO_KEYS.en,
        ...LOCALE_VIDEO_KEYS.es,
        ...baseKeys,
      ]),
    );
  }

  return Array.from(new Set([...LOCALE_VIDEO_KEYS[locale], ...baseKeys]));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function looksLikeVideoCandidate(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (trimmed.includes("youtu")) return true;
  if (/^[\w-]{11}$/.test(trimmed)) return true;
  return false;
}

function collectVideoStrings(
  source: unknown,
  results: VideoCandidate[],
  seen: Set<unknown>,
): void {
  if (!source || typeof source !== "object" || seen.has(source)) {
    return;
  }

  seen.add(source);

  if (Array.isArray(source)) {
    source.forEach((value) => collectVideoStrings(value, results, seen));
    return;
  }

  Object.entries(source as UnknownRecord).forEach(([key, value]) => {
    if (typeof value === "string") {
      const lowerKey = key.toLowerCase();
      if (
        (lowerKey.includes("video") ||
          lowerKey.includes("youtube") ||
          lowerKey.includes("link") ||
          lowerKey.includes("url")) &&
        looksLikeVideoCandidate(value)
      ) {
        results.push({ key, value: value.trim() });
      }
    } else if (value && typeof value === "object") {
      collectVideoStrings(value, results, seen);
    }
  });
}

function extractVideoUrl(
  record: UnknownRecord | undefined,
  locale?: string,
): string | undefined {
  if (!record) return undefined;

  const normalizedLocale = normalizeLocale(locale);
  const directKeys = buildPreferredVideoKeys(normalizedLocale);

  for (const key of directKeys) {
    const candidate = record[key];
    if (typeof candidate === "string" && looksLikeVideoCandidate(candidate)) {
      return candidate.trim();
    }
  }

  const results: VideoCandidate[] = [];
  collectVideoStrings(record, results, new Set());

  if (normalizedLocale) {
    const match = results.find((candidate) =>
      keyMatchesLocale(candidate.key, normalizedLocale),
    );
    if (match) {
      return match.value;
    }
  }

  return results[0]?.value;
}

function extractLocaleSpecificVideoUrl(
  record: UnknownRecord | undefined,
  locale?: string,
): string | undefined {
  if (!record) return undefined;

  const normalizedLocale = normalizeLocale(locale);
  if (!normalizedLocale) {
    return undefined;
  }

  for (const key of LOCALE_VIDEO_KEYS[normalizedLocale]) {
    const candidate = (record as UnknownRecord)[key];
    if (typeof candidate === "string" && looksLikeVideoCandidate(candidate)) {
      return candidate.trim();
    }
  }

  const results: VideoCandidate[] = [];
  collectVideoStrings(record, results, new Set());

  const match = results.find((candidate) =>
    keyMatchesLocale(candidate.key, normalizedLocale),
  );

  return match?.value;
}

function CourseAccessGate({
  onLogin,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onLogin(email.trim(), password);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message || "Failed to log in. Please try again.");
      } else {
        setError("Failed to log in. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg-app)] px-4 py-12">
      <div className="absolute inset-0 -z-10 bg-neutral-950/35 backdrop-blur-sm" aria-hidden />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-soft)]">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">Members Only</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--fg-default)]">Log in to unlock this course</h1>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            Sign in so we can save your lesson progress, streaks, and points across devices.
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label
              htmlFor="course-login-email"
              className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]"
            >
              Email
            </label>
            <input
              id="course-login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-3 text-[var(--fg-default)] shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="course-login-password"
              className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]"
            >
              Password
            </label>
            <input
              id="course-login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-3 text-[var(--fg-default)] shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-brand px-4 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_12px_30px_rgba(169,21,255,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(169,21,255,0.45)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Signing in…" : "Log in"}
          </button>
        </form>
        <div className="mt-6 space-y-4 text-center text-sm text-[var(--fg-muted)]">
          <p>
            <Link to="/forgot-password" className="font-semibold text-brand transition hover:text-brand/80">
              Forgot your password?
            </Link>
          </p>
          <p>
            New here?{" "}
            <Link to="/register" className="font-semibold text-brand transition hover:text-brand/80">
              Create an account
            </Link>
            .
          </p>
          <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
            If you want to use a SimpleLogin email address for privacy feel free.{" "}
            <a
              href="https://simplelogin.io"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-brand transition hover:text-brand/80"
            >
              simplelogin.io
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function cloneCard(raw: unknown): RichCard {
  if (!raw || typeof raw !== "object") {
    return { id: "", title: "" } as RichCard;
  }
  return { ...(raw as UnknownRecord) } as RichCard;
}

function ensureVideoCard(topic: Topic, locale?: string): {
  videoCard: RichCard;
  lessonCards: RichCard[];
  videoSourceId?: string;
} {
  const rawCards = Array.isArray(topic.cards) ? topic.cards : [];
  const clonedCards = rawCards.map((card) => cloneCard(card));

  let lessonCards = clonedCards;
  let videoCard: RichCard | undefined;
  let videoSourceId: string | undefined;

  if (clonedCards.length > 0) {
    const [first, ...rest] = clonedCards;
    const hasContent = isNonEmptyString(first.content);
    const hasQuiz = Boolean(first.quiz);
    const title = typeof first.title === "string" ? first.title : "";
    const videoHint = extractVideoUrl(first, locale) || title.toLowerCase().includes("video");

    if (!hasContent && !hasQuiz && videoHint) {
      videoCard = { ...first };
      lessonCards = rest;
      if (first.id != null) {
        videoSourceId = String(first.id);
      }
    }
  }

  if (!videoCard) {
    const topicRecord = topic as UnknownRecord;
    const extraSources = [
      topicRecord.videoCard,
      topicRecord.video_card,
      topicRecord.videoLesson,
      topicRecord.video_lesson,
      topicRecord.video,
    ];

    for (const candidate of extraSources) {
      if (candidate && typeof candidate === "object") {
        const candidateRecord = cloneCard(candidate);
        const inner =
          candidateRecord.card && typeof candidateRecord.card === "object"
            ? cloneCard(candidateRecord.card)
            : candidateRecord;

        videoCard = inner;
        const rawId =
          (candidateRecord.card && (candidateRecord.card as UnknownRecord).id) ??
          candidateRecord.id ??
          inner.id;
        if (rawId != null) {
          videoSourceId = String(rawId);
        }
        break;
      }
    }
  }

  if (!videoCard) {
    videoCard = {
      id: `${topic.id}-video`,
      title: topic.name ? `Video overview: ${topic.name}` : "Video overview",
    } as RichCard;
  }

  if (videoCard.id == null || videoCard.id === "") {
    videoCard.id = `${topic.id}-video`;
  } else {
    videoCard.id = String(videoCard.id);
  }

  if (!isNonEmptyString(videoCard.title)) {
    videoCard.title = topic.name ? `Video overview: ${topic.name}` : "Video overview";
  }

  return { videoCard, lessonCards, videoSourceId };
}

interface LessonCardContext {
  cardData: RichCard;
  cardIndex: number;
  topic: Topic;
  topicIndex: number;
  totalTopicCards: number;
  module: Module;
  moduleIndex: number;
  topicCount: number;
  modulesLength: number;
  videoSourceId?: string;
  locale?: string;
}

function buildLessonCard({
  cardData,
  cardIndex,
  topic,
  topicIndex,
  totalTopicCards,
  module,
  moduleIndex,
  topicCount,
  modulesLength,
  videoSourceId,
  locale,
}: LessonCardContext): LessonCard {
  const topicId = String(topic.id);
  const moduleId = String(module.id);
  const isVideoLesson = cardIndex === 0;
  const rawSourceId = cardData.id != null ? String(cardData.id) : undefined;
  const cardId = rawSourceId ?? `${topicId}-card-${cardIndex + 1}`;
  const title = isNonEmptyString(cardData.title)
    ? cardData.title
    : isVideoLesson
      ? topic.name
        ? `Video overview: ${topic.name}`
        : "Video overview"
      : `Lesson ${cardIndex + 1}`;
  const localizedVideoUrl = isVideoLesson
    ? extractLocaleSpecificVideoUrl(cardData, locale)
    : undefined;
  const videoUrl = isVideoLesson ? localizedVideoUrl : undefined;
  const youtubeValue = isVideoLesson
    ? videoUrl
    : isNonEmptyString(cardData.youtube) && looksLikeVideoCandidate(cardData.youtube)
      ? cardData.youtube.trim()
      : undefined;

  return {
    ...cardData,
    id: cardId,
    title,
    youtube: youtubeValue,
    videoUrl: isVideoLesson ? videoUrl : undefined,
    isVideoLesson,
    topicId,
    topicName: topic.name,
    moduleId,
    moduleName: module.name,
    sourceCardId: isVideoLesson ? videoSourceId ?? rawSourceId : rawSourceId,
    isLastInTopic: cardIndex === totalTopicCards - 1,
    isLastInModule:
      moduleIndex === modulesLength - 1 &&
      topicIndex === topicCount - 1 &&
      cardIndex === totalTopicCards - 1,
  } as LessonCard;
}

export default function CourseDetail() {
  const { i18n } = useTranslation();
  const { slug = "" } = useParams();
  const { user, login } = useAuth();
  const locale = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
  const { data, isLoading, error } = useLessonPlan(locale, slug);

  if (!user) {
    return <CourseAccessGate onLogin={login} />;
  }

  if (isLoading && !data) {
    return <CourseDetailSkeleton />;
  }

  if (error) {
    if (error.message === "Not Found") {
      return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-[var(--fg-muted)]">Course not found.</div>;
    }
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-brand">Failed to load lesson plan.</div>;
  }

  const effectiveLocale = data?.locale ?? locale;
  const rawModules = data?.modules ?? [];
  const modules = rawModules.map((module, moduleIndex) => {
    const moduleTopics = module.topics ?? [];
    const topicCount = moduleTopics.length;

    const normalizedTopics = moduleTopics.map((topic, topicIndex) => {
      const { videoCard, lessonCards, videoSourceId } = ensureVideoCard(topic, effectiveLocale);
      const topicCardsSource = [videoCard, ...lessonCards];
      const totalTopicCards = topicCardsSource.length;

      const topicCards = topicCardsSource.map((cardData, cardIndex) =>
        buildLessonCard({
          cardData,
          cardIndex,
          topic,
          topicIndex,
          totalTopicCards,
          module,
          moduleIndex,
          topicCount,
          modulesLength: rawModules.length,
          videoSourceId,
          locale: effectiveLocale,
        }),
      );

      return {
        ...topic,
        cards: topicCards,
      };
    });

    return {
      ...module,
      topics: normalizedTopics,
    };
  });

  const cards: LessonCard[] = modules.flatMap((module) =>
    (module.topics ?? []).flatMap((topic) => topic.cards as LessonCard[]),
  );

  return (
    <div className="w-full">
      <div className="w-full overflow-hidden bg-[var(--bg-card)] shadow-[var(--shadow-soft)]">
        <div className="space-y-6 bg-[var(--bg-card)] px-4 pt-10 pb-6 sm:px-10 sm:pb-8 lg:pb-6">
          {/*<div className="relative overflow-hidden rounded-3xl border border-brand/25 bg-gradient-to-br from-white via-red-100/40 to-red-200/40 p-8 text-neutral-900 shadow-[0_35px_120px_rgba(239,68,68,0.18)] transition-colors duration-500 dark:border-brand/40 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-900 dark:text-neutral-50">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.35),_transparent_60%)] opacity-70 transition-opacity duration-500" />
            <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">Immersive Course</p>
                <h1 className="text-3xl font-black uppercase tracking-[0.14em] sm:text-4xl">
                  {data?.title || "Education"}
                </h1>
                {data && data.locale !== locale && (
                  <p className="max-w-xl text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Translation unavailable for this language, showing English.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-3 text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-neutral-700 dark:text-neutral-200">
                <span className="rounded-full border border-neutral-900/20 px-4 py-1 shadow-sm transition duration-300 dark:border-white/20">
                  {modules.length} Modules
                </span>
                <span className="rounded-full border border-neutral-900/20 px-4 py-1 shadow-sm transition duration-300 dark:border-white/20">
                  Guided Learning
                </span>
              </div>
            </div>
          </div>*/}
          {cards.length > 0 ? (
            <div className="overflow-hidden bg-[var(--bg-card)] shadow-[var(--shadow-soft)]">
              <Slider
                cards={cards}
                modules={modules}
                courseTitle={data?.title || "Education"}
                lessonSlug={data?.slug || slug}
              />
            </div>
          ) : (
            <p className="px-6 py-12 text-center text-sm font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
              Lessons coming soon.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
