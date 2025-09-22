import { useEffect, useRef, useState } from "react";
import VideoGhost from "./VideoGhost";

interface YouTubeVideoProps {
  videoId: string;
  title: string;
  onEnded?: () => void;
}

interface YouTubePlayer {
  destroy(): void;
}

interface YouTubePlayerStateEvent {
  data: number;
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, unknown>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: YouTubePlayerStateEvent) => void;
        onError?: () => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: {
    ENDED: number;
  };
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youTubeApiPromise: Promise<YouTubeNamespace> | null = null;

function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API is unavailable in this environment."));
  }

  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }

  if (youTubeApiPromise) {
    return youTubeApiPromise;
  }

  youTubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    let script = document.querySelector<HTMLScriptElement>("script[src='https://www.youtube.com/iframe_api']");

    const cleanup = () => {
      window.onYouTubeIframeAPIReady = previous;
      if (script) {
        script.onerror = null;
      }
    };

    const handleError = () => {
      if (timeout) {
        window.clearTimeout(timeout);
      }
      cleanup();
      youTubeApiPromise = null;
      reject(new Error("Failed to load the YouTube iframe API."));
    };

    const timeout = window.setTimeout(() => {
      handleError();
    }, 15000);

    window.onYouTubeIframeAPIReady = () => {
      if (timeout) {
        window.clearTimeout(timeout);
      }
      if (previous) {
        previous();
      }
      cleanup();
      resolve(window.YT!);
    };

    if (!script) {
      script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = handleError;
      document.head.appendChild(script);
    } else {
      script.onerror = handleError;
    }
  });

  return youTubeApiPromise;
}

export default function YouTubeVideo({ videoId, title, onEnded }: YouTubeVideoProps) {
  const [visible, setVisible] = useState(false);
  const [errored, setErrored] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const intersectionRef = useRef<HTMLDivElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);

  useEffect(() => {
    const el = intersectionRef.current;
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

  useEffect(() => {
    setErrored(false);
    setPlayerReady(false);
  }, [videoId]);

  useEffect(() => {
    if (errored && import.meta.env.DEV) {
      console.warn(`Failed to load YouTube video: ${videoId}`);
    }
  }, [errored, videoId]);

  useEffect(() => {
    if (!visible || errored) {
      return;
    }

    let cancelled = false;

    const setupPlayer = async () => {
      try {
        const YT = await loadYouTubeIframeApi();
        if (cancelled) {
          return;
        }
        if (!playerContainerRef.current) {
          return;
        }

        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }

        playerRef.current = new YT.Player(playerContainerRef.current, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              if (!cancelled) {
                setPlayerReady(true);
              }
            },
            onError: () => {
              if (!cancelled) {
                setErrored(true);
              }
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.ENDED) {
                onEnded?.();
              }
            },
          },
        });
      } catch (error) {
        if (!cancelled) {
          if (import.meta.env.DEV) {
            console.error("Failed to initialize YouTube iframe", error);
          }
          setErrored(true);
        }
      }
    };

    void setupPlayer();

    return () => {
      cancelled = true;
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [visible, videoId, onEnded, errored]);

  return (
    <div ref={intersectionRef} className="w-full">
      {!visible || errored ? (
        <VideoGhost />
      ) : (
        <div className="relative w-full aspect-video">
          {!playerReady && (
            <div
              className="absolute inset-0 flex items-center justify-center rounded bg-neutral-200/90 text-neutral-400 dark:bg-neutral-700/80"
              aria-hidden="true"
            >
              <svg className="h-12 w-12" viewBox="0 0 24 24" fill="currentColor" focusable="false">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          )}
          <div
            ref={playerContainerRef}
            className={`absolute inset-0 h-full w-full overflow-hidden rounded bg-black transition-opacity duration-300 ${
              playerReady ? "opacity-100" : "opacity-0"
            }`}
            title={`YouTube video: ${title}`}
          />
        </div>
      )}
    </div>
  );
}
