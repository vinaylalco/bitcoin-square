import { useCallback, useEffect, useMemo, useState } from "react";
import type { LessonCard } from "../../types/lesson-plan";
import Quiz, { type QuizCompletionMeta } from "./Quiz";
import { getYouTubeId } from "../../lib/getYouTubeId";
import placeholderImage from "/mugshots/cesar.jpeg";
import { normalizeCardId } from "../../utils/localProgress";
import { cn } from "../../utils/cn";
import YouTubeVideo from "./YouTubeVideo";
import VideoGhost from "./VideoGhost";

export default function Card({
  card,
  headerLabel,
  topicName,
  onQuizComplete,
  onVideoComplete,
  onRequestNext,
  quizCompleted,
}: {
  card: LessonCard;
  headerLabel?: string;
  topicName?: string;
  onQuizComplete?: (card: LessonCard, meta?: QuizCompletionMeta) => void;
  onVideoComplete?: (card: LessonCard, meta?: QuizCompletionMeta) => void;
  onRequestNext?: () => void;
  quizCompleted?: boolean;
}) {
  const videoUrl = card.videoUrl;
  const videoId = videoUrl ? getYouTubeId(videoUrl) : null;
  if (videoUrl && !videoId && import.meta.env.DEV) {
    console.warn(`Invalid YouTube ID or URL: ${videoUrl}`);
  }
  const headerImage = placeholderImage;
  const cardKey = useMemo(() => normalizeCardId(card.id) ?? String(card.id), [card.id]);
  const isVideoLesson = Boolean(card.isVideoLesson || (videoUrl && !card.content && !card.quiz));
  const [videoCompleted, setVideoCompleted] = useState(false);
  const quizAlreadyComplete = Boolean(quizCompleted);
  const contextualLabel = headerLabel ?? topicName;

  useEffect(() => {
    if (!isVideoLesson) {
      setVideoCompleted(false);
      return;
    }
    setVideoCompleted(Boolean(quizCompleted));
  }, [card.id, isVideoLesson]);

  useEffect(() => {
    if (isVideoLesson && quizAlreadyComplete) {
      setVideoCompleted(true);
    }
  }, [isVideoLesson, quizAlreadyComplete]);

  const handleVideoEnded = useCallback(() => {
    if (!isVideoLesson) {
      return;
    }
    const alreadyComplete = videoCompleted || quizAlreadyComplete;
    if (alreadyComplete) {
      onRequestNext?.();
      return;
    }
    setVideoCompleted(true);
    if (onVideoComplete) {
      onVideoComplete(card, {
        result: "video_complete",
        delayMs: 500,
        preventScroll: true,
      });
      return;
    }
    onRequestNext?.();
  }, [card, isVideoLesson, onRequestNext, onVideoComplete, quizAlreadyComplete, videoCompleted]);
  const cardShellClass = cn(
    "group relative flex h-full flex-col overflow-visible rounded-3xl border bg-[var(--bg-card)]",
    "border-brand/25 shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:border-brand hover:shadow-[0_45px_110px_rgba(169,21,255,0.32)]",
  );
  const headerGradientClass = "from-neutral-950 via-black to-brand/80 dark:from-neutral-900 dark:via-black dark:to-brand/70";
  const imageBorderClass = "border-white/80 dark:border-brand/50";
  return (
    <>
      <article className={cardShellClass}>
        <header className="relative rounded-t-3xl px-6 pb-16 pt-6 text-white">
          <div
            className={cn(
              "absolute inset-0 z-0 rounded-t-3xl bg-gradient-to-br opacity-95 transition-opacity duration-500 group-hover:opacity-100",
              headerGradientClass,
            )}
            aria-hidden="true"
          />
        <div className="relative z-10 flex flex-col gap-3 pr-0 sm:pr-24 lg:pr-32">
          {contextualLabel && (
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/70">
              {contextualLabel}
            </p>
          )}
          <h3
            id={`card-title-${cardKey}`}
            tabIndex={-1}
            className="text-2xl font-semibold leading-tight text-white"
          >
            {card.title}
          </h3>
          {card.duration_min !== undefined && (
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/60">
              {card.duration_min} min
            </p>
          )}
        </div>
        <div className="pointer-events-none absolute -bottom-12 right-6 z-10">
          <img
            src={headerImage}
            alt={`Cover art for ${card.title}`}
            className={cn(
              "h-28 w-28 rounded-2xl border-4 object-cover shadow-xl transition duration-500 group-hover:translate-y-[-2px] group-hover:rotate-1",
              imageBorderClass,
            )}
          />
        </div>
        </header>
        <div className="flex flex-1 flex-col gap-8 px-6 pb-6 pt-16 text-neutral-700 dark:text-neutral-200">
        {isVideoLesson && (
          <section
            aria-labelledby={`card-${cardKey}-video`}
            className="space-y-4"
          >
            <h2
              id={`card-${cardKey}-video`}
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            >
              Video Overview
            </h2>
            {videoId ? (
              <YouTubeVideo videoId={videoId} title={card.title} onEnded={handleVideoEnded} />
            ) : (
              <div className="space-y-3">
                <VideoGhost />
                <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {videoUrl ? "Video preview unavailable. Open the lesson below." : "Video coming soon."}
                </p>
              </div>
            )}
          </section>
        )}

        {card.objectives && card.objectives.length > 0 && (
          <section
            aria-labelledby={`card-${cardKey}-objectives`}
            className="space-y-3"
          >
            <h2
              id={`card-${cardKey}-objectives`}
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            >
              Learning Objectives
            </h2>
            <ul className="list-outside list-disc space-y-2 pl-5">
              {card.objectives.map((obj, i) => (
                <li key={i} className="leading-relaxed">
                  {obj}
                </li>
              ))}
            </ul>
          </section>
        )}

        {card.content && (
          <section
            aria-labelledby={`card-${cardKey}-content`}
            className="space-y-3"
          >
            <h2
              id={`card-${cardKey}-content`}
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            >
              Lesson Content
            </h2>
            <div
              className="leading-relaxed [&_p]:mb-4 [&_p:last-child]:mb-0 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-brand [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: card.content }}
            />
          </section>
        )}

        {card.quiz && (
          <section
            aria-labelledby={`card-${cardKey}-quiz`}
            className="space-y-4"
          >
            <h2
              id={`card-${cardKey}-quiz`}
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            >
              Quiz
            </h2>
            <Quiz
              quiz={card.quiz}
              onComplete={(meta) => onQuizComplete?.(card, meta)}
              isCompleted={quizCompleted}
            />
          </section>
        )}
        </div>
      </article>
    </>
  );
}
