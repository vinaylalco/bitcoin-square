import React, { useState } from "react";
import type { LessonCardData } from "./types";
import { safeArray } from "../../utils/safeTypes";

export default function LessonCard({ lesson }: { lesson: LessonCardData }) {
  const { id, title, content, objectives, quiz, duration_min, topicName } = lesson;
  const safeObjectives = safeArray(objectives);
  const safeOptions = safeArray(quiz.options);

  // Local UI state (no gating)
  const [selected, setSelected] = useState<string>("");
  const [text, setText] = useState<string>("");

  const isCorrect = quiz.type === "multiple_choice" && selected === quiz.correct_answer;
  const hasText = quiz.type !== "multiple_choice" && text.trim().length > 0;

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
        <header className="space-y-2 mb-5">
          <div className="text-xs inline-flex items-center gap-2 px-2 py-1 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-700/40">
            <span className="inline-block h-2 w-2 bg-brand rounded-full" />
            <span className="font-medium">{topicName}</span>
            <span className="text-neutral-500">• {duration_min} min</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold">{title}</h2>
        </header>

        <section className="leading-relaxed text-lg">
          <p>{content}</p>
        </section>

        <section className="mt-6">
          <h3 className="text-base font-semibold mb-2">Learning objectives</h3>
          <ul className="list-disc pl-5 space-y-1 text-lg">
            {safeObjectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h3 className="text-base font-semibold mb-2">Quiz</h3>
          <p className="mb-3 text-lg">{quiz.question}</p>

          {quiz.type === "multiple_choice" ? (
            <div className="space-y-2">
              {safeOptions.map((opt, i) => (
                <label key={i} className="flex items-center gap-2 cursor-pointer text-lg">
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
                className={`mt-3 text-base font-medium ${
                  selected
                    ? isCorrect
                      ? "text-emerald-600"
                      : "text-brand"
                    : "text-neutral-500 dark:text-neutral-400"
                }`}
              >
                {selected ? (isCorrect ? "Correct ✓" : "Try again") : "Select an answer (optional)"}
              </p>
            </div>
          ) : (
            <div>
              <textarea
                className="mt-2 w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 p-3 text-lg min-h-28"
                rows={4}
                placeholder={
                  quiz.type === "reflection"
                    ? "Write your reflection… (optional)"
                    : "What would you do in this scenario? (optional)"
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p
                className={`mt-3 text-base font-medium ${
                  hasText ? "text-emerald-600" : "text-neutral-500 dark:text-neutral-400"
                }`}
              >
                {hasText ? "Nice thoughts!" : "You can skip this and continue"}
              </p>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
