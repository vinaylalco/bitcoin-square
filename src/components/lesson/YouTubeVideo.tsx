import { useEffect, useMemo, useRef, useState } from "react";
import VideoGhost from "./VideoGhost";

interface YouTubeVideoProps {
  videoId: string;
  title: string;
  onEnded?: () => void;
}

const YOUTUBE_ORIGIN = "https://www.youtube.com";

function parseMessageData(data: unknown) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("Unable to parse YouTube message", error);
      }
      return null;
    }
  }
  if (typeof data === "object" && data !== null) {
    return data as Record<string, unknown>;
  }
  return null;
}

export default function YouTubeVideo({ videoId, title, onEnded }: YouTubeVideoProps) {
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const listenerId = useMemo(() => `${videoId}-${Math.random().toString(36).slice(2)}`, [videoId]);
  const playerOrigin = YOUTUBE_ORIGIN;

  useEffect(() => {
    setLoaded(false);
  }, [videoId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const iframe = iframeRef.current;
    if (!iframe || !loaded) {
      return undefined;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== playerOrigin) {
        return;
      }
      if (!iframe.contentWindow || event.source !== iframe.contentWindow) {
        return;
      }

      const data = parseMessageData(event.data);
      if (!data) {
        return;
      }

      const eventName = typeof data.event === "string" ? data.event : undefined;
      if (eventName === "onStateChange") {
        const state = typeof data.info === "number" ? data.info : undefined;
        if (state === 0) {
          onEnded?.();
        }
      }

      if (eventName === "infoDelivery") {
        const info = data.info as { playerState?: unknown } | undefined;
        const state = typeof info?.playerState === "number" ? info.playerState : undefined;
        if (state === 0) {
          onEnded?.();
        }
      }
    };

    window.addEventListener("message", handleMessage);

    const postCommand = (message: Record<string, unknown>) => {
      try {
        iframe.contentWindow?.postMessage(JSON.stringify(message), playerOrigin);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("Failed to post message to YouTube iframe", error);
        }
      }
    };

    postCommand({ event: "listening", id: listenerId });
    postCommand({ event: "command", func: "addEventListener", args: ["onStateChange"] });

    const pollId = window.setInterval(() => {
      postCommand({ event: "listening", id: listenerId });
      postCommand({ event: "command", func: "addEventListener", args: ["onStateChange"] });
    }, 1500);

    return () => {
      window.clearInterval(pollId);
      window.removeEventListener("message", handleMessage);
    };
  }, [listenerId, loaded, onEnded, playerOrigin]);

  const embedUrl = useMemo(() => {
    const params = new URLSearchParams({
      enablejsapi: "1",
      rel: "0",
      playsinline: "1",
    });
    return `${playerOrigin}/embed/${videoId}?${params.toString()}`;
  }, [playerOrigin, videoId]);

  return (
    <div className="relative w-full">
      <div
        className={`relative w-full overflow-hidden rounded-2xl transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="aspect-video w-full">
          <iframe
            ref={iframeRef}
            className="h-full w-full"
            width="560"
            height="315"
            src={embedUrl}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            onLoad={() => setLoaded(true)}
          />
        </div>
      </div>
      {!loaded && (
        <div className="absolute inset-0">
          <VideoGhost />
        </div>
      )}
    </div>
  );
}
