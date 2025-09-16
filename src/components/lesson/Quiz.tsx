import { useId, useState } from "react";
import type { Quiz as QuizType } from "../../types/lesson-plan";

export default function Quiz({ quiz }: { quiz: QuizType }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<"correct" | "incorrect" | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const groupId = useId();

  if (quiz.type !== "multiple_choice") {
    return (
      <div className="space-y-3">
        <p className="text-base font-medium text-neutral-900 dark:text-neutral-100">
          {quiz.question}
        </p>
        <textarea
          className="min-h-[120px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-neutral-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          rows={4}
        />
        {quiz.correct_answer && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAnswer((s) => !s)}
              className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {showAnswer ? "Hide answer" : "Show answer"}
            </button>
            {showAnswer && (
              <p
                className="text-sm text-neutral-700 dark:text-neutral-200"
                aria-live="polite"
              >
                {quiz.correct_answer}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const handleSelect = (opt: string) => {
    if (selected === opt) {
      setSelected(null);
      setStatus(null);
      return;
    }
    setSelected(opt);
    setStatus(opt === quiz.correct_answer ? "correct" : "incorrect");
  };

  const getStateClasses = (opt: string) => {
    const isActive = selected === opt;
    if (!isActive || !status) {
      return "border-neutral-300 bg-neutral-100/80 text-neutral-900 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700";
    }
    if (status === "correct" && isActive) {
      return "border-green-500 bg-green-100 text-green-900 dark:border-green-400 dark:bg-green-900/40 dark:text-green-100";
    }
    if (status === "incorrect" && isActive) {
      return "border-red-500 bg-red-100 text-red-900 dark:border-red-400 dark:bg-red-900/40 dark:text-red-100";
    }
    return "border-neutral-300 bg-neutral-100/80 text-neutral-900 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700";
  };

  return (
    <div className="space-y-4">
      <p className="text-base font-medium text-neutral-900 dark:text-neutral-100">
        {quiz.question}
      </p>
      <div className="space-y-3">
        {quiz.options?.map((opt, index) => {
          const optionId = `${groupId}-${index}`;
          const isActive = selected === opt;
          const isCorrect = status === "correct" && isActive;
          const isIncorrect = status === "incorrect" && isActive;
          return (
            <label
              key={opt}
              htmlFor={optionId}
              className={`relative block cursor-pointer rounded-xl border px-4 py-3 text-base font-medium transition focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2 focus-within:ring-offset-white dark:focus-within:ring-offset-neutral-900 ${getStateClasses(
                opt,
              )}`}
            >
              <input
                id={optionId}
                type="checkbox"
                className="sr-only"
                checked={isActive}
                onChange={() => handleSelect(opt)}
              />
              <span className="flex flex-col gap-1">
                <span>
                  {isCorrect
                    ? "Correct Answer"
                    : isIncorrect
                    ? "Try Again"
                    : opt}
                </span>
                {isActive && (
                  <span className="text-sm font-normal text-neutral-700 dark:text-neutral-300">
                    {opt}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}