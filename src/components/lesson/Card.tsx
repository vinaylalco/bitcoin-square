import type { Card as CardType } from "../../types/lesson-plan";
import Quiz from "./Quiz";
import YouTubeVideo from "./YouTubeVideo";
import VideoGhost from "./VideoGhost";
import { getYouTubeId } from "../../lib/getYouTubeId";

export default function Card({
  card,
  topicName,
}: {
  card: CardType;
  topicName?: string;
}) {
  const videoId = card.youtube ? getYouTubeId(card.youtube) : null;
  if (card.youtube && !videoId && import.meta.env.DEV) {
    console.warn(`Invalid YouTube ID or URL: ${card.youtube}`);
  }
  return (
    <article className="p-4 border rounded h-full">
      {topicName && (
        <p className="text-sm font-medium text-brand mb-1">{topicName}</p>
      )}
      <h3 className="text-lg font-semibold">{card.title}</h3>
      {card.duration_min !== undefined && (
        <p className="text-sm text-neutral-500">{card.duration_min} min</p>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          {videoId ? (
            <YouTubeVideo videoId={videoId} title={card.title} />
          ) : (
            <VideoGhost />
          )}
        </div>
        <div>
          {card.content && (
            <p className="whitespace-pre-line">{card.content}</p>
          )}
          <h3 className="mt-2"><b>Learning Objectives:</b></h3>
          {card.objectives && card.objectives.length > 0 && (
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {card.objectives.map((obj, i) => (
                <li key={i}>{obj}</li>
              ))}
            </ul>
          )}
          <h3 className="mt-2"><b>Quizz:</b></h3>
          {card.quiz && <Quiz quiz={card.quiz} />}
        </div>
      </div>
    </article>
  );
}