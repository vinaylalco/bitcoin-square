import { useState } from "react";
import type { Quiz as QuizType } from "../../types/lesson-plan";

export default function Quiz({ quiz }: { quiz: QuizType }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (quiz.type !== "multiple_choice") {
    return (
      <div className="mt-4">
        <p className="mb-2 font-medium">{quiz.question}</p>
        <textarea className="w-full p-2 border rounded" rows={3} />
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <p className="mb-2 font-medium">{quiz.question}</p>
      {quiz.options?.map((opt) => (
        <label key={opt} className="block mb-1">
          <input
            type="radio"
            name="quiz"
            value={opt}
            checked={selected === opt}
            onChange={() => setSelected(opt)}
            className="mr-2"
          />
          {opt}
        </label>
      ))}
      <button type="submit" className="mt-2 px-3 py-1 bg-brand text-white rounded">
        Submit
      </button>
      {submitted && (
        <p className="mt-2 text-sm">
          {selected === quiz.correct_answer ? "Correct!" : `Correct answer: ${quiz.correct_answer}`}
        </p>
      )}
    </form>
  );
}
