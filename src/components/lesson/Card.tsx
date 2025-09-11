import type { Card as CardType } from "../../types/lesson-plan";
import Quiz from "./Quiz";
import YouTubeVideo from "./YouTubeVideo";
import VideoGhost from "./VideoGhost";
import { getYouTubeId } from "../../lib/getYouTubeId";

export default function Card({
  card,
  topicName,
  purchased,
  onPurchase,
}: {
  card: CardType;
  topicName?: string;
  /** Whether the user has purchased the course */
  purchased?: boolean;
  /** Callback to trigger checkout */
  onPurchase?: () => void;
}) {
  const videoId = card.youtube ? getYouTubeId(card.youtube) : null;
  if (card.youtube && !videoId && import.meta.env.DEV) {
    console.warn(`Invalid YouTube ID or URL: ${card.youtube}`);
  }
  const locked = card.locked && !purchased;
  return (
    <article className="relative p-4 border rounded h-full">
      {topicName && (
        <p className="text-sm font-medium text-brand mb-1">{topicName}</p>
      )}
      <h3
        id={`card-title-${card.id}`}
        tabIndex={-1}
        className="text-lg font-semibold"
      >
        {card.title}
      </h3>
      {card.duration_min !== undefined && (
        <p className="text-sm text-neutral-500">{card.duration_min} min</p>
      )}
      <div className="mt-4 space-y-4">
        <div>
          {videoId ? (
            <YouTubeVideo videoId={videoId} title={card.title} />
          ) : (
            <VideoGhost />
          )}
        </div>
        {card.content && (
          <p className="whitespace-pre-line">{card.content}</p>
        )}
        {card.objectives && card.objectives.length > 0 && (
          <div>
            <h3 className="font-bold">Learning Objectives:</h3>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {card.objectives.map((obj, i) => (
                <li key={i}>{obj}</li>
              ))}
            </ul>
          </div>
        )}
        {card.quiz && (
          <div>
            <h3 className="font-bold">Quiz:</h3>
            <Quiz quiz={card.quiz} />
          </div>
        )}
      </div>
      {locked && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
          <button
            type="button"
            onClick={onPurchase}
            className="px-4 py-2 bg-brand text-white rounded"
          >
            Purchase Course
          </button>
        </div>
      )}
    </article>
  );
}