import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import Slider from "../components/lesson/Slider";
import CourseDetailSkeleton from "../components/course/CourseDetailSkeleton";
import { useLessonPlan } from "../hooks/useLessonPlan";
import type { Card, LessonCard, Topic } from "../types/lesson-plan";

type UnknownRecord = Record<string, unknown>;
type RichCard = Card & UnknownRecord;

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

function collectVideoStrings(source: unknown, results: string[], seen: Set<unknown>): void {
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
        results.push(value.trim());
      }
    } else if (value && typeof value === "object") {
      collectVideoStrings(value, results, seen);
    }
  });
}

function extractVideoUrl(record: UnknownRecord | undefined): string | undefined {
  if (!record) return undefined;

  const directKeys = [
    "videoUrl",
    "youtube",
    "youtube_video_link",
    "youtubeLink",
    "youtube_url",
    "video_link",
    "videoLink",
  ];

  for (const key of directKeys) {
    const candidate = record[key];
    if (typeof candidate === "string" && looksLikeVideoCandidate(candidate)) {
      return candidate.trim();
    }
  }

  const results: string[] = [];
  collectVideoStrings(record, results, new Set());
  return results[0];
}

function cloneCard(raw: unknown): RichCard {
  if (!raw || typeof raw !== "object") {
    return { id: "", title: "" } as RichCard;
  }
  return { ...(raw as UnknownRecord) } as RichCard;
}

function ensureVideoCard(topic: Topic): {
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
    const videoHint = extractVideoUrl(first) || title.toLowerCase().includes("video");

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

export default function CourseDetail() {
  const { i18n } = useTranslation();
  const { slug = "" } = useParams();
  const locale = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
  const { data, isLoading, error, isFetching } = useLessonPlan(locale, slug);

  if (isLoading && !data) {
    return <CourseDetailSkeleton />;
  }

  if (error) {
    if (error.message === "Not Found") {
      return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-[var(--fg-muted)]">Course not found.</div>;
    }
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-brand">Failed to load lesson plan.</div>;
  }

  const modules = data?.modules ?? [];
  const cards: LessonCard[] = modules.flatMap((module, moduleIndex) => {
    const topics = module.topics ?? [];
    return topics.flatMap((topic, topicIndex) => {
      const { videoCard, lessonCards, videoSourceId } = ensureVideoCard(topic);
      const topicCards = [videoCard, ...lessonCards];
      const topicId = String(topic.id);
      const moduleId = String(module.id);

      return topicCards.map((cardData, cardIndex) => {
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
        const videoUrl = isVideoLesson ? extractVideoUrl(cardData) : undefined;
        const youtubeValue =
          isVideoLesson && videoUrl
            ? videoUrl
            : isNonEmptyString(cardData.youtube) && looksLikeVideoCandidate(cardData.youtube)
              ? cardData.youtube.trim()
              : undefined;

        const totalTopicCards = topicCards.length;
        const topicCount = topics.length;

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
            moduleIndex === modules.length - 1 &&
            topicIndex === topicCount - 1 &&
            cardIndex === totalTopicCards - 1,
        } as LessonCard;
      });
    });
  });

  return (
    <div className="w-full pb-24">
      <div className="w-full overflow-hidden bg-[var(--bg-card)] shadow-[var(--shadow-soft)]">
        <div className="space-y-6 bg-[var(--bg-card)] px-4 py-10 sm:px-10">
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
          {isFetching && (
            <p className="text-center text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
              Updating course…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
