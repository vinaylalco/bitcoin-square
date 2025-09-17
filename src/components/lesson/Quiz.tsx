import { useEffect, useId, useRef, useState } from "react";
import type { Quiz as QuizType } from "../../types/lesson-plan";

interface QuizProps {
  quiz: QuizType;
  onComplete?: (meta?: QuizCompletionMeta) => void;
  isCompleted?: boolean;
}

export interface QuizCompletionMeta {
  delayMs?: number;
  result: "correct" | "incorrect" | "revealed";
}

const MULTIPLE_CHOICE_FLASH_DURATION = 650;
const TEXT_REVEAL_HOLD_DURATION = 2400;

export default function Quiz({ quiz, onComplete, isCompleted = false }: QuizProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<"correct" | "incorrect" | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [completed, setCompleted] = useState(isCompleted);
  const [textAnswer, setTextAnswer] = useState("");
  const [textError, setTextError] = useState<string | null>(null);
  const [flashCorrect, setFlashCorrect] = useState(false);
  const [answerHighlight, setAnswerHighlight] = useState(false);
  const flashTimeoutRef = useRef<number | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const groupId = useId();

  useEffect(() => {
    if (isCompleted) {
      setCompleted(true);
      if (quiz.type === "multiple_choice" && quiz.correct_answer) {
        setSelected(quiz.correct_answer);
        setStatus("correct");
        setFlashCorrect(false);
      } else if (quiz.type !== "multiple_choice") {
        setShowAnswer(true);
        setAnswerHighlight(false);
      }
    } else {
      setCompleted(false);
      setSelected(null);
      setStatus(null);
      setFlashCorrect(false);
      if (quiz.type !== "multiple_choice") {
        setShowAnswer(false);
        setAnswerHighlight(false);
      }
    }
  }, [isCompleted, quiz]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        if (flashTimeoutRef.current !== null) {
          window.clearTimeout(flashTimeoutRef.current);
        }
        if (highlightTimeoutRef.current !== null) {
          window.clearTimeout(highlightTimeoutRef.current);
        }
      }
    };
  }, []);

  if (quiz.type !== "multiple_choice") {
    const handleToggleAnswer = () => {
      if (!showAnswer) {
        if (!textAnswer.trim()) {
          setTextError("Please enter your answer before revealing the solution.");
          return;
        }
        setTextError(null);
        if (!completed) {
          setCompleted(true);
          setAnswerHighlight(true);
          if (typeof window !== "undefined") {
            if (highlightTimeoutRef.current !== null) {
              window.clearTimeout(highlightTimeoutRef.current);
            }
            highlightTimeoutRef.current = window.setTimeout(() => {
              setAnswerHighlight(false);
              highlightTimeoutRef.current = null;
            }, TEXT_REVEAL_HOLD_DURATION);
          } else {
            setAnswerHighlight(false);
          }
          onComplete?.({ delayMs: TEXT_REVEAL_HOLD_DURATION, result: "revealed" });
        }
        setShowAnswer(true);
      } else {
        setShowAnswer(false);
        setAnswerHighlight(false);
      }
    };

    return (
      <div className="space-y-3">
        <p className="text-base font-medium text-neutral-900 dark:text-neutral-100">
          {quiz.question}
        </p>
        <textarea
          className="min-h-[120px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-neutral-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          rows={4}
          value={textAnswer}
          onChange={(event) => {
            setTextAnswer(event.target.value);
            if (textError && event.target.value.trim()) {
              setTextError(null);
            }
          }}
        />
        {textError && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {textError}
          </p>
        )}
        {quiz.correct_answer && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleToggleAnswer}
              className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {showAnswer ? "Hide answer" : "Show answer"}
            </button>
            {showAnswer && (
              <p
                className={`quiz-answer text-sm text-neutral-700 dark:text-neutral-200 ${answerHighlight ? "quiz-answer--highlight" : ""}`}
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
    if (completed) {
      return;
    }
    setSelected(opt);
    const isCorrectChoice = opt === quiz.correct_answer;
    setStatus(isCorrectChoice ? "correct" : "incorrect");
    setCompleted(true);
    if (isCorrectChoice) {
      if (typeof window !== "undefined") {
        if (flashTimeoutRef.current !== null) {
          window.clearTimeout(flashTimeoutRef.current);
        }
      }
      setFlashCorrect(true);
    } else {
      setFlashCorrect(false);
    }
    if (isCorrectChoice) {
      if (typeof window !== "undefined") {
        flashTimeoutRef.current = window.setTimeout(() => {
          setFlashCorrect(false);
          flashTimeoutRef.current = null;
        }, MULTIPLE_CHOICE_FLASH_DURATION);
      } else {
        setFlashCorrect(false);
      }
    }
    onComplete?.({
      delayMs: isCorrectChoice ? MULTIPLE_CHOICE_FLASH_DURATION : 400,
      result: isCorrectChoice ? "correct" : "incorrect",
    });
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
              className={`quiz-option relative block cursor-pointer rounded-xl border px-4 py-3 text-base font-medium transition focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2 focus-within:ring-offset-white dark:focus-within:ring-offset-neutral-900 ${getStateClasses(
                opt,
              )} ${isCorrect && flashCorrect ? "quiz-option--flash" : ""}`}
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