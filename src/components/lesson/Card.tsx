import { useMemo } from "react";
import type { LessonCard, LessonSummaryItem } from "../../types/lesson-plan";
import Quiz, { type QuizCompletionMeta } from "./Quiz";
import { getYouTubeId } from "../../lib/getYouTubeId";
import placeholderImage from "/mugshots/cesar.jpeg";
import { normalizeCardId } from "../../utils/localProgress";

export default function Card({
  card,
  topicName,
  onQuizComplete,
  quizCompleted,
}: {
  card: LessonCard;
  topicName?: string;
  onQuizComplete?: (card: LessonCard, meta?: QuizCompletionMeta) => void;
  quizCompleted?: boolean;
}) {
  const videoId = card.youtube ? getYouTubeId(card.youtube) : null;
  if (card.youtube && !videoId && import.meta.env.DEV) {
    console.warn(`Invalid YouTube ID or URL: ${card.youtube}`);
  }
  const headerImage = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : placeholderImage;
  const cardKey = useMemo(() => normalizeCardId(card.id) ?? String(card.id), [card.id]);
  const isSummaryCard = Boolean(card.isSummary);
  const isReviewCard = Boolean(card.isReview);
  const summaryItems: LessonSummaryItem[] = isSummaryCard ? card.summaryItems ?? [] : [];

  if (isSummaryCard) {
    return (
      <article
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition dark:border-neutral-700 dark:bg-neutral-900"
      >
        <header className="relative px-6 pb-16 pt-6 text-white dark:text-neutral-900">
          <div className="absolute inset-0 z-0 bg-black dark:bg-white" aria-hidden="true" />
          <div className="relative z-10 flex flex-col gap-3 pr-0 sm:pr-24 lg:pr-32">
            {card.moduleName && (
              <p className="text-sm font-semibold uppercase tracking-wide text-neutral-300 dark:text-neutral-600">
                {card.moduleName}
              </p>
            )}
            <h3
              id={`card-title-${cardKey}`}
              tabIndex={-1}
              className="text-2xl font-semibold leading-tight"
            >
              {card.title}
            </h3>
          </div>
          <div className="pointer-events-none absolute -bottom-12 right-6 z-10">
            <img
              src={headerImage}
              alt={`Cover art for ${card.title}`}
              className="h-27 w-28 rounded-2xl border-4 border-white object-cover shadow-xl dark:border-black"
            />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 px-6 pb-6 pt-16 text-neutral-700 dark:text-neutral-200">
          <section aria-labelledby={`card-${cardKey}-summary`} className="space-y-4">
            <h2
              id={`card-${cardKey}-summary`}
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            >
              Here’s what you got wrong
            </h2>
            {summaryItems.length > 0 ? (
              <ul className="space-y-3">
                {summaryItems.map((item) => (
                  <li
                    key={item.cardId}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100"
                  >
                    <p className="font-semibold">{item.topicName}</p>
                    <p>{item.title}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 shadow-sm dark:border-green-400/30 dark:bg-green-900/30 dark:text-green-100">
                Excellent work—no missed questions in this module on your first pass!
              </p>
            )}
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Keep practicing the review cards to turn those misses into wins.
            </p>
          </section>
        </div>
      </article>
    );
  }

  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition dark:border-neutral-700 dark:bg-neutral-900"
    >
      <header className="relative px-6 pb-16 pt-6 text-white dark:text-neutral-900">
        <div
          className="absolute inset-0 z-0 bg-black dark:bg-white"
          aria-hidden="true"
        />
        <div className="relative z-10 flex flex-col gap-3 pr-0 sm:pr-24 lg:pr-32">
          {topicName && (
            <p className="text-sm font-semibold uppercase tracking-wide text-neutral-300 dark:text-neutral-600">
              {topicName}
            </p>
          )}
          <h3
            id={`card-title-${cardKey}`}
            tabIndex={-1}
            className="text-2xl font-semibold leading-tight"
          >
            {card.title}
          </h3>
          {card.duration_min !== undefined && (
            <p className="text-sm text-neutral-300 dark:text-neutral-500">
              {card.duration_min} min
            </p>
          )}
        </div>
        <div className="pointer-events-none absolute -bottom-12 right-6 z-10">
          <img
            src={headerImage}
            alt={`Cover art for ${card.title}`}
            className="h-27 w-28 rounded-2xl border-4 border-white object-cover shadow-xl dark:border-black"
          />
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-8 px-6 pb-6 pt-16 text-neutral-700 dark:text-neutral-200">
        {isReviewCard && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
            You got this one wrong earlier but let&apos;s try again to cement your learning.
          </div>
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
              isReview={isReviewCard}
            />
          </section>
        )}
      </div>
    </article>
  );
}