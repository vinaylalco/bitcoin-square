import React, { useEffect, useState } from "react";
import type { LessonCardData } from "./types";

type Props = {
  lesson: LessonCardData;
  /** Notify parent when the ability to advance for this card changes */
  onAnswerStateChange?: (canAdvance: boolean) => void;
};

/** Renders a single lesson card. The page (not the card) can scroll vertically. */
export default function LessonCard({ lesson, onAnswerStateChange }: Props) {
  const { id, title, content, objectives, quiz, duration_min, topicName } = lesson;

  const [selected, setSelected] = useState<string>("");   // for MCQ
  const [text, setText] = useState<string>("");           // for reflection/scenario

  const canAdvance =
    quiz.type === "multiple_choice"
      ? selected === quiz.correct_answer
      : text.trim().length > 0;

  useEffect(() => {
    onAnswerStateChange?.(canAdvance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdvance]);

  return (
    <article className="relative w-full px-4 sm:px-6">
      <div
        className="
          rounded-2xl border shadow-sm
          bg-white text-neutral-900
          dark:bg-neutral-800 dark:text-neutral-100
          border-neutral-200 dark:border-neutral-700
          p-5 sm:p-6
        "
      >
        <header className="space-y-2 mb-4">
          <div className="text-xs inline-flex items-center gap-2 px-2 py-1 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-700/40">
            <span className="inline-block h-2 w-2 bg-brand rounded-full" />
            <span className="font-medium">{topicName}</span>
            <span className="text-neutral-500">• {duration_min} min</span>
          </div>
          <h2 className="text-2xl font-bold">{title}</h2>
        </header>

        <section className="prose prose-neutral dark:prose-invert max-w-none leading-relaxed">
          <p>{content}</p>
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold mb-2">Learning objectives</h3>
          <ul className="list-disc pl-5 space-y-1">
            {objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold mb-2">Quiz</h3>
          <p className="mb-3">{quiz.question}</p>

          {quiz.type === "multiple_choice" ? (
            <div className="space-y-2">
              {quiz.options.map((opt, i) => (
                <label key={i} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`q-${id}`}
                    className="accent-brand"
                    checked={selected === opt}
                    onChange={() => setSelected(opt)}
                  />
                  <span>{opt}</span>
                </label>
              ))}
              <p
                className={`mt-2 text-sm ${
                  selected
                    ? selected === quiz.correct_answer
                      ? "text-green-600"
                      : "text-brand"
                    : "text-neutral-500 dark:text-neutral-400"
                }`}
              >
                {selected
                  ? selected === quiz.correct_answer
                    ? "Correct ✓"
                    : "Try again"
                  : "Select an answer to continue"}
              </p>
            </div>
          ) : (
            <div>
              <textarea
                className="mt-2 w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 p-2"
                rows={3}
                placeholder={
                  quiz.type === "reflection"
                    ? "Write your reflection..."
                    : "What would you do in this scenario?"
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p
                className={`mt-2 text-sm ${
                  text.trim().length > 0
                    ? "text-green-600"
                    : "text-neutral-500 dark:text-neutral-400"
                }`}
              >
                {text.trim().length > 0
                  ? "Looks good — you can continue"
                  : "Enter a response to continue"}
              </p>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
