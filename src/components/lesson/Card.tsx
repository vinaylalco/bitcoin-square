import { useMemo } from "react";
import type { LessonCard } from "../../types/lesson-plan";
import Quiz, { type QuizCompletionMeta } from "./Quiz";
import { getYouTubeId } from "../../lib/getYouTubeId";
import placeholderImage from "/mugshots/cesar.jpeg";
import { normalizeCardId } from "../../utils/localProgress";
import { cn } from "../../utils/cn";
import Skeleton from "../ui/Skeleton";

export default function Card({
  card,
  topicName,
  onQuizComplete,
  quizCompleted,
  isLoading = false,
}: {
  card: LessonCard;
  topicName?: string;
  onQuizComplete?: (card: LessonCard, meta?: QuizCompletionMeta) => void;
  quizCompleted?: boolean;
  isLoading?: boolean;
}) {
  const videoId = card.youtube ? getYouTubeId(card.youtube) : null;
  if (card.youtube && !videoId && import.meta.env.DEV) {
    console.warn(`Invalid YouTube ID or URL: ${card.youtube}`);
  }
  const headerImage = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : placeholderImage;
  const cardKey = useMemo(() => normalizeCardId(card.id) ?? String(card.id), [card.id]);
  const cardShellClass = cn(
    "group relative flex h-full flex-col overflow-visible rounded-3xl border bg-[var(--bg-card)]",
    "border-brand/25 shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:border-brand hover:shadow-[0_45px_110px_rgba(169,21,255,0.32)]",
  );
  const contentVisibilityClass = isLoading
    ? "opacity-0 pointer-events-none"
    : "opacity-100 pointer-events-auto transition-opacity duration-300";
  const headerGradientClass = "from-neutral-950 via-black to-brand/80 dark:from-neutral-900 dark:via-black dark:to-brand/70";
  const imageBorderClass = "border-white/80 dark:border-brand/50";
  const renderSkeleton = () => {
    if (!isLoading) {
      return null;
    }
    return (
      <div
        className="pointer-events-none absolute inset-0 z-20 flex flex-col gap-5 rounded-3xl border border-transparent bg-[var(--bg-card)]/96 p-6 backdrop-blur-sm"
        aria-hidden="true"
      >
        <Skeleton className="h-4 w-24 rounded-full" />
        <Skeleton className="h-10 w-3/4 rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
        {card.quiz ? (
          <div className="mt-auto space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <article className={cardShellClass} aria-busy={isLoading}>
      {renderSkeleton()}
      <header className={cn("relative rounded-t-3xl px-6 pb-16 pt-6 text-white", contentVisibilityClass)}>
        <div
          className={cn(
            "absolute inset-0 z-0 rounded-t-3xl bg-gradient-to-br opacity-95 transition-opacity duration-500 group-hover:opacity-100",
            headerGradientClass,
          )}
          aria-hidden="true"
        />
        <div className="relative z-10 flex flex-col gap-3 pr-0 sm:pr-24 lg:pr-32">
          {topicName && (
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/70">
              {topicName}
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
      <div
        className={cn(
          "flex flex-1 flex-col gap-8 px-6 pb-6 pt-16 text-neutral-700 dark:text-neutral-200",
          contentVisibilityClass,
        )}
      >
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
            <p className="leading-relaxed whitespace-pre-line">
              {card.content}
            </p>
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
  );
}