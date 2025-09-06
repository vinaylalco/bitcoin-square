import type { Topic as TopicType } from "../../types/lesson-plan";
import Card from "./Card";

export default function Topic({ topic }: { topic: TopicType }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold mb-4">{topic.name}</h2>
      {topic.cards.map((c) => (
        <Card key={c.id} card={c} />
      ))}
    </section>
  );
}
