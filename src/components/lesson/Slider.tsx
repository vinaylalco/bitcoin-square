import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Card as CardType } from "../../types/lesson-plan";
import Card from "./Card";

interface SliderCard extends CardType {
  topicName: string;
}

export default function Slider({ cards }: { cards: SliderCard[] }) {
  const [index, setIndex] = useState(0);
  const total = cards.length;

  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(total - 1, i + 1));
  const progress = total > 0 ? ((index + 1) / total) * 100 : 0;

  return (
    <div>
      <div className="h-2 bg-neutral-200 rounded mb-4 overflow-hidden">
        <div
          className="h-full bg-brand"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="relative">
        {total > 0 && <Card card={cards[index]} topicName={cards[index].topicName} />}
        {index > 0 && (
          <button
            onClick={prev}
            aria-label="Previous"
            className="hidden lg:flex items-center justify-center absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full w-10 h-10 bg-white border rounded-full shadow"
          >
            <ChevronLeft />
          </button>
        )}
        {index < total - 1 && (
          <button
            onClick={next}
            aria-label="Next"
            className="hidden lg:flex items-center justify-center absolute right-0 top-1/2 -translate-y-1/2 translate-x-full w-10 h-10 bg-white border rounded-full shadow"
          >
            <ChevronRight />
          </button>
        )}
      </div>
    </div>
  );
}
