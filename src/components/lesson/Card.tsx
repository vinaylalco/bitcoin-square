import { useMemo } from "react";
import type { Card as CardType } from "../../types/lesson-plan";
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
  card: CardType;
  topicName?: string;
  onQuizComplete?: (meta?: QuizCompletionMeta) => void;
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
        <div className="pointer-events-none absolute -bottom-12 right-6 z-20">
          <img
            src={headerImage}
            alt={`Cover art for ${card.title}`}
            className="h-28 w-28 rounded-2xl border-4 border-white object-cover shadow-xl dark:border-black"
          />
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-8 px-6 pb-6 pt-16 text-neutral-700 dark:text-neutral-200">
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
              onComplete={(meta) => onQuizComplete?.(meta)}
              isCompleted={quizCompleted}
            />
          </section>
        )}
      </div>
    </article>
  );
}