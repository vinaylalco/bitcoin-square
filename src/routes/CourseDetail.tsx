import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import Slider from "../components/lesson/Slider";
import CourseDetailSkeleton from "../components/course/CourseDetailSkeleton";
import { useLessonPlan } from "../hooks/useLessonPlan";
import type { Card, LessonCard, Module, Topic } from "../types/lesson-plan";

type UnknownRecord = Record<string, unknown>;
type RichCard = Card & UnknownRecord;
type VideoCandidate = { key: string; value: string };

type VideoKeyLocale = "en" | "es" | "neutral";

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

function inferVideoKeyLocale(key: string): VideoKeyLocale {
  const normalized = standardizeKey(key);

  const mentionsEnglish =
    normalized.includes("english") ||
    normalized.includes("_en") ||
    normalized.startsWith("en_");
  const mentionsSpanish =
    normalized.includes("spanish") ||
    normalized.includes("_es") ||
    normalized.startsWith("es_");

  if (mentionsEnglish && !mentionsSpanish) {
    return "en";
  }

  if (mentionsSpanish && !mentionsEnglish) {
    return "es";
  }

  return "neutral";
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
    const localeMatches = results.filter(
      (candidate) => inferVideoKeyLocale(candidate.key) === normalizedLocale,
    );
    if (localeMatches.length > 0) {
      return localeMatches[0]?.value;
    }

    const neutralMatches = results.filter(
      (candidate) => inferVideoKeyLocale(candidate.key) === "neutral",
    );
    if (neutralMatches.length > 0) {
      return neutralMatches[0]?.value;
    }

    return undefined;
  }

  return results[0]?.value;
}

function extractNeutralVideoUrl(
  record: UnknownRecord | undefined,
): string | undefined {
  if (!record) return undefined;

  const directKeys = buildPreferredVideoKeys(undefined).filter(
    (key) => inferVideoKeyLocale(key) === "neutral",
  );

  for (const key of directKeys) {
    const candidate = (record as UnknownRecord)[key];
    if (typeof candidate === "string" && looksLikeVideoCandidate(candidate)) {
      return candidate.trim();
    }
  }

  const results: VideoCandidate[] = [];
  collectVideoStrings(record, results, new Set());

  const neutralMatch = results.find(
    (candidate) => inferVideoKeyLocale(candidate.key) === "neutral",
  );

  return neutralMatch?.value;
}

function extractLocaleSpecificVideoUrl(
  record: UnknownRecord | undefined,
  locale?: string,
  visited: Set<UnknownRecord> = new Set(),
): string | undefined {
  if (!record || typeof record !== "object") return undefined;
  if (visited.has(record as UnknownRecord)) return undefined;
  visited.add(record as UnknownRecord);

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

  const unknownRecord = record as UnknownRecord;
  const localizations = unknownRecord.localizations;
  if (Array.isArray(localizations)) {
    for (const entry of localizations) {
      if (!entry || typeof entry !== "object") continue;

      const entryRecord = entry as UnknownRecord;
      const entryLocale = normalizeLocale(
        typeof entryRecord.locale === "string"
          ? entryRecord.locale
          : typeof entryRecord.language === "string"
            ? entryRecord.language
            : typeof entryRecord.attributes === "object" && entryRecord.attributes
              ? ((entryRecord.attributes as UnknownRecord).locale as string | undefined)
              : undefined,
      );

      if (entryLocale && entryLocale !== normalizedLocale) {
        continue;
      }

      const target =
        entryRecord.attributes && typeof entryRecord.attributes === "object"
          ? (entryRecord.attributes as UnknownRecord)
          : entryRecord;

      const localized = extractLocaleSpecificVideoUrl(
        target,
        normalizedLocale,
        visited,
      );
      if (localized) {
        return localized;
      }

      const fallback = extractVideoUrl(target, normalizedLocale);
      if (fallback) {
        return fallback;
      }
    }
  }

  const results: VideoCandidate[] = [];
  collectVideoStrings(record, results, new Set());

  const match = results.find(
    (candidate) => inferVideoKeyLocale(candidate.key) === normalizedLocale,
  );

  if (match) {
    return match.value;
  }

  const neutralMatch = results.find(
    (candidate) => inferVideoKeyLocale(candidate.key) === "neutral",
  );

  if (neutralMatch) {
    return neutralMatch.value;
  }

  return extractVideoUrl(record, normalizedLocale);
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
    const title = typeof first.title === "string" ? first.title : "";
    const normalizedLocale = normalizeLocale(locale);
    const localizedVideoUrl = extractLocaleSpecificVideoUrl(
      first,
      normalizedLocale,
    );
    const neutralVideoUrl = extractNeutralVideoUrl(first);
    const alternateLocale =
      normalizedLocale === "en"
        ? "es"
        : normalizedLocale === "es"
          ? "en"
          : undefined;
    const alternateVideoUrl = alternateLocale
      ? extractLocaleSpecificVideoUrl(first, alternateLocale)
      : undefined;
    const anyVideoUrl =
      localizedVideoUrl ??
      neutralVideoUrl ??
      alternateVideoUrl ??
      extractVideoUrl(first);
    const videoHint =
      Boolean(anyVideoUrl) || title.toLowerCase().includes("video");

    if (videoHint) {
      videoCard = { ...first };
      lessonCards = rest;
      const preferredVideoUrl = localizedVideoUrl ?? neutralVideoUrl;
      videoCard.youtube = preferredVideoUrl;
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
  const neutralVideoUrl = isVideoLesson
    ? extractNeutralVideoUrl(cardData)
    : undefined;
  const videoUrl = isVideoLesson
    ? localizedVideoUrl ?? neutralVideoUrl
    : undefined;
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
  const { t, i18n } = useTranslation();
  const { slug = "" } = useParams();
  const locale = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
  const { data, isLoading, error } = useLessonPlan(locale, slug);

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

  const normalizedSlug = String(data?.slug ?? slug ?? "").toLowerCase();
  const enableCustomize = normalizedSlug === "full-btc-course";

  return (
    <div className="w-full">
      {data && data.locale !== locale && (
        <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-10">
          <p className="max-w-xl text-xs font-medium uppercase tracking-[0.32em] text-[var(--fg-muted)]">
            {t("courses.localeFallback", {
              defaultValue: "Showing default language for this course.",
            })}
          </p>
        </div>
      )}
      <div className="w-full shadow-[var(--shadow-soft)]">
        <div className="space-y-6 px-4 pt-10 pb-6 sm:px-10 sm:pb-8 lg:pb-6">
          {cards.length > 0 ? (
            <Slider
              cards={cards}
              modules={modules}
              courseTitle={data?.title || "Education"}
              lessonSlug={data?.slug || slug}
              enableCustomize={enableCustomize}
            />
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
