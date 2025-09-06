import React, { useEffect, useRef, useState } from "react";
import type { Card } from "../../types/lesson-plan";

interface LessonCardProps {
  lesson: Card;
  completed: boolean;
  onCorrect: () => void;
}

export default function LessonCard({ lesson, completed, onCorrect }: LessonCardProps) {
  const quiz = lesson.quiz;
  const [status, setStatus] = useState<"idle" | "correct" | "incorrect">("idle");
  const [input, setInput] = useState("");
  const debounceRef = useRef<number>();

  useEffect(() => {
    if (completed) {
      setStatus("correct");
    }
  }, [completed]);

  if (!quiz) {
    return (
      <article className="p-4 border rounded">
        <h3 className="text-lg font-semibold mb-2">{lesson.title}</h3>
        {lesson.content && <p className="mt-2 whitespace-pre-line">{lesson.content}</p>}
      </article>
    );
  }

  if (quiz.type === "multiple_choice") {
    const handleSelect = (opt: string) => {
      if (status === "correct") return;
      if (opt === quiz.correct_answer) {
        setStatus("correct");
        onCorrect();
      } else {
        setStatus("incorrect");
      }
    };

    return (
      <article className="p-4 border rounded">
        <h3 className="text-lg font-semibold mb-2">{lesson.title}</h3>
        <p className="mb-2 font-medium">{quiz.question}</p>
        {quiz.options?.map((opt) => (
          <label key={opt} className="block mb-1">
            <input
              type="radio"
              name={`quiz-${lesson.id}`}
              className="mr-2"
              onChange={() => handleSelect(opt)}
              disabled={status === "correct"}
            />
            {opt}
          </label>
        ))}
        {status === "correct" && <p className="mt-2 text-green-600">Correct!</p>}
        {status === "incorrect" && <p className="mt-2 text-red-600">Try again.</p>}
      </article>
    );
  }

  const normalize = (s: string) => s.trim().toLowerCase();
  const validate = (val: string) => {
    if (quiz.correct_answer && normalize(val) === normalize(quiz.correct_answer)) {
      setStatus("correct");
      onCorrect();
    } else {
      setStatus(val ? "incorrect" : "idle");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => validate(val), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      validate(input);
    }
  };

  return (
    <article className="p-4 border rounded">
      <h3 className="text-lg font-semibold mb-2">{lesson.title}</h3>
      <p className="mb-2 font-medium">{quiz.question}</p>
      <input
        type="text"
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="w-full p-2 border rounded"
        disabled={status === "correct"}
      />
      {status === "correct" && <p className="mt-2 text-green-600">Correct!</p>}
      {status === "incorrect" && <p className="mt-2 text-red-600">Try again.</p>}
    </article>
  );
}
