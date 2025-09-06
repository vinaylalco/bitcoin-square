import { useEffect, useRef, useState } from "react";
import VideoGhost from "./VideoGhost";

export default function YouTubeVideo({
  videoId,
  title,
}: {
  videoId: string;
  title: string;
}) {
  const [visible, setVisible] = useState(false);
  const [errored, setErrored] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (errored) {
    if (import.meta.env.DEV) {
      console.warn(`Failed to load YouTube video: ${videoId}`);
    }
    return <VideoGhost />;
  }

  return (
    <div ref={ref} className="w-full aspect-video">
      {visible ? (
        <iframe
          className="h-full w-full rounded"
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={`YouTube video: ${title}`}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onError={() => setErrored(true)}
        />
      ) : (
        <VideoGhost />
      )}
    </div>
  );
}
