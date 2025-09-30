import { useEffect, useMemo, useRef, useState } from "react";

interface YouTubeVideoProps {
  videoId: string;
  title: string;
  onEnded?: () => void;
  onPlay?: () => void;
  isActive?: boolean;
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

export default function YouTubeVideo({
  videoId,
  title,
  onEnded,
  onPlay,
  isActive,
}: YouTubeVideoProps) {
  const [shouldLoad, setShouldLoad] = useState<boolean>(isActive ?? true);
  const [loaded, setLoaded] = useState(false);
  const [pageOrigin] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.location.origin,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const listenerId = useMemo(() => `${videoId}-${Math.random().toString(36).slice(2)}`, [videoId]);
  const playerOrigin = YOUTUBE_ORIGIN;
  const lastPlayerStateRef = useRef<number | null>(null);

  useEffect(() => {
    if (isActive) {
      setShouldLoad(true);
    }
  }, [isActive]);

  useEffect(() => {
    if (shouldLoad || typeof window === "undefined") {
      return undefined;
    }

    const node = containerRef.current;
    if (!node) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShouldLoad(true);
          }
        });
      },
      { rootMargin: "200px" },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [shouldLoad]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const connections: Array<{ href: string; rel: "preconnect" | "dns-prefetch" }> = [
      { href: "https://www.youtube.com", rel: "preconnect" },
      { href: "https://www.google.com", rel: "preconnect" },
      { href: "https://s.ytimg.com", rel: "preconnect" },
      { href: "https://i.ytimg.com", rel: "preconnect" },
      { href: "https://i.ytimg.com", rel: "dns-prefetch" },
    ];

    const appendedLinks: HTMLLinkElement[] = [];

    connections.forEach(({ href, rel }) => {
      const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"][href="${href}"]`);
      if (existing) {
        return;
      }

      const link = document.createElement("link");
      link.rel = rel;
      link.href = href;
      if (rel === "preconnect") {
        link.crossOrigin = "";
      }
      document.head.appendChild(link);
      appendedLinks.push(link);
    });

    return () => {
      appendedLinks.forEach((link) => {
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!shouldLoad) {
      return;
    }
    setLoaded(false);
    lastPlayerStateRef.current = null;
  }, [shouldLoad, videoId]);

  useEffect(() => {
    if (typeof window === "undefined" || !shouldLoad) {
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
        if (state !== undefined) {
          if (state === 1 && lastPlayerStateRef.current !== 1) {
            onPlay?.();
          }
          if (state === 0) {
            onEnded?.();
          }
          lastPlayerStateRef.current = state;
        }
      }

      if (eventName === "infoDelivery") {
        const info = data.info as { playerState?: unknown } | undefined;
        const state = typeof info?.playerState === "number" ? info.playerState : undefined;
        if (state !== undefined) {
          if (state === 1 && lastPlayerStateRef.current !== 1) {
            onPlay?.();
          }
          if (state === 0) {
            onEnded?.();
          }
          lastPlayerStateRef.current = state;
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
  }, [listenerId, loaded, onEnded, onPlay, playerOrigin, shouldLoad]);

  const embedUrl = useMemo(() => {
    if (!shouldLoad) {
      return null;
    }
    const params = new URLSearchParams({
      enablejsapi: "1",
      rel: "0",
      playsinline: "1",
    });
    if (pageOrigin) {
      params.set("origin", pageOrigin);
    }
    return `${playerOrigin}/embed/${videoId}?${params.toString()}`;
  }, [pageOrigin, playerOrigin, shouldLoad, videoId]);

  const loadingMode = isActive === false ? "lazy" : "eager";

  const iframeTitle = title.trim() ? title : "YouTube video player";

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative w-full overflow-hidden rounded-2xl">
        <div className="aspect-video w-full">
          <iframe
            ref={iframeRef}
            className="h-full w-full"
            width="560"
            height="315"
            src={embedUrl}
            title={iframeTitle}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            onLoad={() => setLoaded(true)}
            loading={loadingMode}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              role="status"
              aria-live="polite"
              aria-hidden={loaded}
              className={`flex items-center gap-3 rounded-full bg-slate-950/70 px-4 py-2 text-sm font-medium text-white transition-opacity duration-300 ${loaded ? "opacity-0" : "opacity-100"}`}
            >
              <svg
                className="h-5 w-5 animate-spin text-emerald-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <span>Loading video…</span>
            </div>
          </div>
        </div>
      </div>
    </div> 
  );
}
