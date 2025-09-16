import React, { useCallback, useEffect, useState } from "react";
import type { LessonCardData } from "./types";
import LightningAnimation from "../LightningAnimation";
import { usePoints } from "../../context/PointsContext";
import { useAuth } from "../../context/AuthContext";

type Props = {
  lesson: LessonCardData;
  isActive?: boolean;
  onRequestNext?: () => void;
};

export default function LessonCard({ lesson, isActive = false, onRequestNext }: Props) {
  const { id, title, content, objectives, quiz, duration_min, topicName } = lesson;
  const { completeLesson, hasCompleted } = usePoints();
  const { user } = useAuth();

  const [selected, setSelected] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [strikeActive, setStrikeActive] = useState(false);
  const [loginPrompt, setLoginPrompt] = useState(false);

  const alreadyCompleted = hasCompleted(id);
  const isCorrect = quiz.type === "multiple_choice" && selected === quiz.correct_answer;
  const hasText = quiz.type !== "multiple_choice" && text.trim().length > 0;

  useEffect(() => {
    if (user) {
      setLoginPrompt(false);
    }
  }, [user]);

  const handleStrikeComplete = useCallback(() => {
    setStrikeActive(false);
    onRequestNext?.();
  }, [onRequestNext]);

  const triggerCompletion = useCallback(() => {
    if (!isActive || strikeActive) return;
    setStrikeActive(true);
    completeLesson(id, 10).then(() => {
      if (!user) {
        setLoginPrompt(true);
      }
    });
  }, [completeLesson, id, isActive, strikeActive, user]);

  const handleOptionSelect = (opt: string) => {
    setSelected(opt);
    if (quiz.correct_answer === opt) {
      triggerCompletion();
    }
  };

  const handleToggleAnswer = () => {
    if (!hasText) {
      setTextError("Please add your answer before viewing the solution.");
      return;
    }
    setTextError(null);
    setShowAnswer((prev) => {
      if (!prev) {
        triggerCompletion();
      }
      return !prev;
    });
  };

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
            {objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h3 className="text-base font-semibold mb-2">Quiz</h3>
          <p className="mb-3 text-lg">{quiz.question}</p>

          {quiz.type === "multiple_choice" ? (
            <div className="space-y-2">
              {quiz.options.map((opt, i) => (
                <label key={i} className="flex items-center gap-2 cursor-pointer text-lg">
                  <input
                    type="radio"
                    name={`q-${id}`}
                    className="accent-brand"
                    checked={selected === opt}
                    onChange={() => handleOptionSelect(opt)}
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
                {selected
                  ? isCorrect
                    ? alreadyCompleted
                      ? "Completed! Points saved."
                      : "Correct! +10 points"
                    : "Try again"
                  : "Select an answer"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                className="mt-2 w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 p-3 text-lg min-h-28"
                rows={4}
                placeholder={
                  quiz.type === "reflection"
                    ? "Write your reflection…"
                    : "What would you do in this scenario?"
                }
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (textError) setTextError(null);
                }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleAnswer}
                  className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-brand/50"
                  disabled={!hasText || strikeActive}
                >
                  {showAnswer ? "Hide answer" : "Show answer"}
                </button>
                <span
                  className={`text-sm ${
                    hasText
                      ? "text-emerald-600"
                      : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {hasText ? "Ready to check your thoughts" : "Add a response to continue"}
                </span>
              </div>
              {textError && <p className="text-sm text-brand">{textError}</p>}
              {showAnswer && quiz.correct_answer && (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-800/60">
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100">Suggested answer</p>
                  <p className="mt-1 text-neutral-700 dark:text-neutral-200">{quiz.correct_answer}</p>
                </div>
              )}
              {(showAnswer || alreadyCompleted) && (
                <p className="text-base font-medium text-emerald-600">Answer checked! +10 points</p>
              )}
            </div>
          )}

          {loginPrompt && !user && (
            <p className="mt-4 text-sm font-medium text-brand">
              Log in or create an account to make sure your points are saved.
            </p>
          )}
        </section>
      </div>

      <LightningAnimation active={strikeActive} onComplete={handleStrikeComplete} />
    </article>
  );
}
