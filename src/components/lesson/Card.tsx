import type { Card as CardType } from "../../types/lesson-plan";
import Quiz from "./Quiz";

export default function Card({ card }: { card: CardType }) {
  return (
    <article className="mb-4 p-4 border rounded">
      <h3 className="text-lg font-semibold">{card.title}</h3>
      {card.duration_min !== undefined && (
        <p className="text-sm text-neutral-500">{card.duration_min} min</p>
      )}
      {card.content && <p className="mt-2 whitespace-pre-line">{card.content}</p>}
      {card.objectives && card.objectives.length > 0 && (
        <ul className="mt-2 list-disc pl-5 space-y-1">
          {card.objectives.map((obj, i) => (
            <li key={i}>{obj}</li>
          ))}
        </ul>
      )}
      {card.quiz && <Quiz quiz={card.quiz} />}
    </article>
  );
}
