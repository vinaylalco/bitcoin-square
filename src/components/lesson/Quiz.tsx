import { useEffect, useId, useRef, useState } from "react";
import Modal from "../ui/Modal";
import type { Quiz as QuizType } from "../../types/lesson-plan";

interface QuizProps {
  quiz: QuizType;
  onComplete?: (meta?: QuizCompletionMeta) => void;
  isCompleted?: boolean;
  isReview?: boolean;
}

export interface QuizCompletionMeta {
  delayMs?: number;
  result: "correct" | "incorrect" | "revealed";
}

const MULTIPLE_CHOICE_FLASH_DURATION = 650;
const TEXT_REVEAL_HOLD_DURATION = 2400;

export default function Quiz({
  quiz,
  onComplete,
  isCompleted = false,
  isReview = false,
}: QuizProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<"correct" | "incorrect" | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [completed, setCompleted] = useState(isCompleted);
  const [textAnswer, setTextAnswer] = useState("");
  const [textError, setTextError] = useState<string | null>(null);
  const [flashCorrect, setFlashCorrect] = useState(false);
  const [answerHighlight, setAnswerHighlight] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showTextFeedbackModal, setShowTextFeedbackModal] = useState(false);
  const [pendingMeta, setPendingMeta] = useState<QuizCompletionMeta | null>(null);
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);
  const [showReflectionModal, setShowReflectionModal] = useState(
    quiz.type === "reflection" && !isCompleted,
  );
  const flashTimeoutRef = useRef<number | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const groupId = useId();
  const reflectionHeadingId = useId();
  const confirmHeadingId = useId();
  const confirmDescriptionId = useId();
  const textFeedbackHeadingId = useId();
  const textFeedbackDescriptionId = useId();
  const reflectionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);
  const showAnswerButtonRef = useRef<HTMLButtonElement | null>(null);
  const textContinueButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isCompleted) {
      setCompleted(true);
      if (quiz.type === "multiple_choice" && quiz.correct_answer) {
        setSelected(quiz.correct_answer);
        setStatus("correct");
        setFlashCorrect(false);
      } else if (quiz.type === "reflection") {
        setShowReflectionModal(false);
      } else if (quiz.type !== "multiple_choice") {
        setShowAnswer(true);
        setAnswerHighlight(false);
      }
    } else {
      setCompleted(false);
      if (quiz.type === "multiple_choice") {
        setSelected(null);
        setStatus(null);
        setFlashCorrect(false);
      } else if (quiz.type === "reflection") {
        setShowReflectionModal(true);
      } else {
        setShowAnswer(false);
        setAnswerHighlight(false);
      }
    }

    if (typeof window !== "undefined") {
      if (flashTimeoutRef.current !== null) {
        window.clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = null;
      }
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    }

    setShowConfirmModal(false);
    setShowTextFeedbackModal(false);
    setPendingMeta(null);
    setPendingChoice(null);
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

  useEffect(() => {
    setTextAnswer("");
    setTextError(null);
  }, [quiz]);

  if (quiz.type === "reflection") {
    const handleReflectionComplete = () => {
      if (!completed) {
        setCompleted(true);
      }
      setShowReflectionModal(false);
      onComplete?.({ delayMs: 0, result: "revealed" });
    };

    return (
      <>
        <div className="space-y-3">
          <p className="text-base font-medium text-neutral-900 dark:text-neutral-100">
            Give yourself a moment to process before moving on.
          </p>
          <button
            ref={reflectionTriggerRef}
            type="button"
            onClick={() => setShowReflectionModal(true)}
            className="inline-flex items-center gap-2 rounded-full border border-amber-400/70 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-400/60 dark:bg-amber-500/15 dark:text-amber-100 dark:hover:bg-amber-500/25"
          >
            Revisit reflection prompt
          </button>
        </div>
        <Modal
          open={showReflectionModal}
          dismissible={false}
          labelledBy={reflectionHeadingId}
          returnFocusRef={reflectionTriggerRef}
        >
          <div className="rounded-3xl border border-amber-400/70 bg-[var(--bg-card)] p-8 text-neutral-900 shadow-[var(--shadow-soft)] dark:border-amber-400/60 dark:text-neutral-100">
            <p className="text-xs font-semibold uppercase tracking-[0.36em] text-amber-500 dark:text-amber-300">
              Reflection pause
            </p>
            <h2 id={reflectionHeadingId} className="mt-3 text-2xl font-semibold leading-snug">
              {quiz.question}
            </h2>
            <p className="mt-4 text-base text-neutral-600 dark:text-neutral-300">
              Notice what this lesson stirred up. Capture a thought, a feeling, or a next step you
              want to remember.
            </p>
            <textarea
              className="mt-5 min-h-[160px] w-full rounded-2xl border border-amber-400/60 bg-amber-500/10 px-4 py-3 text-base text-neutral-900 shadow-sm transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-amber-400/50 dark:bg-amber-500/10 dark:text-amber-50"
              rows={5}
              value={textAnswer}
              onChange={(event) => setTextAnswer(event.target.value)}
              placeholder="Write down what resonated, what surprised you, or how you’ll apply it…"
            />
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
              These reflections stay with you—they aren’t graded.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleReflectionComplete}
                className="inline-flex items-center justify-center rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:bg-amber-400 dark:text-neutral-900 dark:hover:bg-amber-300"
              >
                Contemplate & Next
              </button>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  if (quiz.type !== "multiple_choice") {
    const handleToggleAnswer = () => {
      if (showAnswer) {
        setShowAnswer(false);
        setAnswerHighlight(false);
        return;
      }

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
        setPendingMeta({ delayMs: TEXT_REVEAL_HOLD_DURATION, result: "revealed" });
        setShowTextFeedbackModal(true);
      }

      setShowAnswer(true);
    };

    const handleTextFeedbackContinue = () => {
      setShowTextFeedbackModal(false);
      const metaToSend = pendingMeta ?? { delayMs: 0, result: "revealed" };
      setPendingMeta(null);
      onComplete?.(metaToSend);
    };

    return (
      <>
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
                ref={showAnswerButtonRef}
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

        <Modal
          open={showTextFeedbackModal}
          dismissible={false}
          labelledBy={textFeedbackHeadingId}
          describedBy={textFeedbackDescriptionId}
          returnFocusRef={showAnswerButtonRef}
        >
          <div className="rounded-3xl border border-neutral-200 bg-[var(--bg-card)] p-7 text-neutral-900 shadow-[var(--shadow-soft)] dark:border-neutral-700 dark:text-neutral-100">
            <p className="text-xs font-semibold uppercase tracking-[0.36em] text-neutral-500 dark:text-neutral-400">
              Reflection noted
            </p>
            <h2 id={textFeedbackHeadingId} className="mt-3 text-2xl font-semibold leading-snug">
              Nice perspective.
            </h2>
            <p
              id={textFeedbackDescriptionId}
              className="mt-3 text-base text-neutral-600 dark:text-neutral-300"
            >
              Here’s how the lesson frames this idea.
            </p>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-100">
                <p className="text-xs uppercase tracking-[0.28em] text-neutral-600 dark:text-neutral-400">
                  Your take
                </p>
                <p className="mt-1 whitespace-pre-line text-base font-semibold">
                  {textAnswer}
                </p>
              </div>
              {quiz.correct_answer ? (
                <div className="rounded-2xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm text-neutral-900 shadow-sm dark:border-brand/60 dark:bg-brand/15 dark:text-neutral-100">
                  <p className="text-xs uppercase tracking-[0.28em] text-neutral-600 dark:text-neutral-400">
                    Lesson anchor
                  </p>
                  <p className="mt-1 text-base font-semibold">
                    {quiz.correct_answer}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                ref={textContinueButtonRef}
                type="button"
                onClick={handleTextFeedbackContinue}
                className="inline-flex items-center justify-center rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
              >
                Continue
              </button>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  const handleSelect = (opt: string) => {
    if (completed) {
      return;
    }
    setSelected(opt);
    const isCorrectChoice = opt === quiz.correct_answer;
    setStatus(isCorrectChoice ? "correct" : "incorrect");
    if (isCorrectChoice) {
      setCompleted(true);
    } else {
      setCompleted(!isReview);
    }
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
    setPendingMeta({ delayMs: 0, result: isCorrectChoice ? "correct" : "incorrect" });
    setPendingChoice(opt);
    setShowConfirmModal(true);
  };

  const handleConfirmContinue = () => {
    setShowConfirmModal(false);
    const metaToSend = pendingMeta ?? {
      delayMs: 0,
      result: status === "incorrect" ? "incorrect" : "correct",
    };
    setPendingMeta(null);
    setPendingChoice(null);
    onComplete?.(metaToSend);
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

  const choicePreview = pendingChoice ?? selected ?? "";
  const isCorrectSelection = status === "correct";

  return (
    <>
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
                      ? "Try again"
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

      <Modal
        open={showConfirmModal}
        dismissible={false}
        labelledBy={confirmHeadingId}
        describedBy={confirmDescriptionId}
      >
        <div className="rounded-3xl border border-neutral-200 bg-[var(--bg-card)] p-7 text-neutral-900 shadow-[var(--shadow-soft)] dark:border-neutral-700 dark:text-neutral-100">
          <p className="text-xs font-semibold uppercase tracking-[0.36em] text-neutral-500 dark:text-neutral-400">
            Choice locked in
          </p>
          <h2 id={confirmHeadingId} className="mt-3 text-2xl font-semibold leading-snug">
            {isCorrectSelection ? "Nicely done." : "Let's tune this insight."}
          </h2>
          <p
            id={confirmDescriptionId}
            className="mt-3 text-base text-neutral-600 dark:text-neutral-300"
          >
            {isCorrectSelection
              ? "Your reasoning stays aligned with the lesson."
              : "Revisit the lesson anchor and take another shot."}
          </p>
          <div
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${isCorrectSelection
              ? "border-emerald-300 bg-emerald-100/80 text-emerald-900 dark:border-emerald-400/60 dark:bg-emerald-500/20 dark:text-emerald-100"
              : "border-red-300 bg-red-100/80 text-red-900 dark:border-red-400/60 dark:bg-red-500/20 dark:text-red-100"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.28em] text-neutral-600 dark:text-neutral-400">
              You chose
            </p>
            <p className="mt-1 text-base font-semibold">{choicePreview}</p>
          </div>
          {status === "incorrect" && quiz.correct_answer && (
            <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-300">
              Try anchoring on: {" "}
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                {quiz.correct_answer}
              </span>
            </p>
          )}
          <div className="mt-6 flex justify-end">
            <button
              ref={continueButtonRef}
              type="button"
              onClick={handleConfirmContinue}
              className="inline-flex items-center justify-center rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              Continue
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
