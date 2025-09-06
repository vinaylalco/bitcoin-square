import { useState } from "react";
import type { Quiz as QuizType } from "../../types/lesson-plan";

export default function Quiz({ quiz }: { quiz: QuizType }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);

  if (quiz.type !== "multiple_choice") {
    return (
      <div className="mt-4">
        <p className="mb-2 font-medium">{quiz.question}</p>
        <textarea className="w-full p-2 border rounded" rows={3} />
        {quiz.correct_answer && (
          <>
            <button
              type="button"
              onClick={() => setShowAnswer((s) => !s)}
              className="mt-2 px-3 py-1 bg-brand text-white rounded"
            >
              {showAnswer ? "Hide answer" : "Show answer"}
            </button>
            {showAnswer && (
              <p className="mt-2 text-sm" aria-live="polite">
                {quiz.correct_answer}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  const handleSelect = (opt: string) => {
    setSelected(opt);
    setFeedback(
      opt === quiz.correct_answer ? "Correct" : "Incorrect—try again"
    );
  };

  return (
    <div className="mt-4">
      <p className="mb-2 font-medium">{quiz.question}</p>
      {quiz.options?.map((opt) => (
        <label key={opt} className="block mb-1">
          <input
            type="radio"
            name="quiz"
            value={opt}
            checked={selected === opt}
            onChange={() => handleSelect(opt)}
            className="mr-2"
          />
          {opt}
        </label>
      ))}
      {feedback && (
        <p className="mt-2 text-sm" aria-live="polite">
          {feedback}
        </p>
      )}
    </div>
  );
}