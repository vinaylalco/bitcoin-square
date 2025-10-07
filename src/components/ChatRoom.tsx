import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Event, EventTemplate } from "../lib/nostrToolsShim";

import MessageInput from "./MessageInput";
import type { RoomDefinition } from "./RoomList";
import { nostrClient } from "../lib/nostrClient";
import { cacheMessage, getCachedMessages, type CachedMessage } from "../utils/chatCache";
import {
  decryptBinary,
  decryptMessage,
  encryptMessage,
  hasRoomKey,
} from "../utils/aes";
import {
  flushPendingEvents,
  queuePendingEvent,
  type PendingEvent,
} from "../utils/backgroundSync";
import {
  getCachedMediaBlob,
  getCachedPreview,
  setCachedMediaBlob,
  setCachedPreview,
} from "../utils/mediaCache";

interface MediaContent {
  type: "media";
  url: string;
  mimeType: string;
  size: number;
  digest: string;
  iv?: string;
  width?: number;
  height?: number;
  previewUrl?: string | null;
  fullUrl?: string | null;
  status: "idle" | "loading" | "ready" | "error";
  error?: string | null;
}

interface TextContent {
  type: "text";
  body: string;
}

type MessageContent = TextContent | MediaContent;

interface ChatMessage {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags?: string[][];
  content: MessageContent;
  pending?: boolean;
  offline?: boolean;
  error?: string;
}

interface ChatRoomProps {
  room: RoomDefinition;
  pubkey: string | null;
  prefetched?: CachedMessage[];
}

const PUBKEY_FALLBACK = "anonymous";

const formatPubkey = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;

const base64ToUint8Array = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const parseMediaEvent = (event: Event): MediaContent => {
  const url = event.tags.find((tag) => tag[0] === "url")?.[1] ?? "";
  const mimeType = event.tags.find((tag) => tag[0] === "m")?.[1] ?? "application/octet-stream";
  const sizeTag = event.tags.find((tag) => tag[0] === "size")?.[1];
  const dimTag = event.tags.find((tag) => tag[0] === "dim")?.[1];
  const digest = event.tags.find((tag) => tag[0] === "x")?.[1] ?? event.id;
  const iv = event.tags.find((tag) => tag[0] === "iv")?.[1];

  const [width, height] = dimTag?.split("x").map((value) => Number.parseInt(value, 10)) ?? [];

  return {
    type: "media",
    url,
    mimeType,
    size: sizeTag ? Number.parseInt(sizeTag, 10) : 0,
    digest,
    iv,
    width: Number.isFinite(width) ? width : undefined,
    height: Number.isFinite(height) ? height : undefined,
    status: "idle",
  };
};

const cachedToMessage = (cached: CachedMessage): ChatMessage => {
  if (cached.kind === 1063) {
    const stubEvent: Event = {
      kind: cached.kind ?? 1063,
      id: cached.id,
      pubkey: cached.pubkey,
      created_at: cached.created_at,
      content: cached.content,
      tags: cached.tags ?? [],
      sig: "",
    };
    const media = parseMediaEvent(stubEvent);
    return {
      id: cached.id,
      pubkey: cached.pubkey,
      created_at: cached.created_at,
      kind: cached.kind ?? 1063,
      tags: cached.tags,
      content: media,
    };
  }

  return {
    id: cached.id,
    pubkey: cached.pubkey,
    created_at: cached.created_at,
    kind: cached.kind ?? 1,
    tags: cached.tags,
    content: {
      type: "text",
      body: cached.decrypted ?? cached.content,
    },
  };
};

const createPreviewFromBlob = async (blob: Blob) => {
  if (typeof window === "undefined") return null;
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const maxDimension = 320;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.6);
  } catch (error) {
    console.warn("Failed to generate preview", error);
    return null;
  }
};

const ChatRoom: React.FC<ChatRoomProps> = ({ room, pubkey, prefetched }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    prefetched ? prefetched.map((item) => cachedToMessage(item)) : [],
  );
  const [isLoading, setIsLoading] = useState(!prefetched);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [roomKeyAvailable, setRoomKeyAvailable] = useState(room.type !== "private");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const typingThrottleRef = useRef<number>(0);
  const objectUrlRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (prefetched) {
      setMessages(prefetched.map((item) => cachedToMessage(item)));
      setIsLoading(false);
    } else {
      setMessages([]);
      setIsLoading(true);
    }
  }, [prefetched, room.id]);

  useEffect(() => {
    let cancelled = false;
    if (room.type !== "private") {
      setRoomKeyAvailable(true);
      return;
    }

    setRoomKeyAvailable(false);
    hasRoomKey(room.id)
      .then((available) => {
        if (!cancelled) {
          setRoomKeyAvailable(available);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoomKeyAvailable(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [room.hasLocalKey, room.id, room.type]);

  const eventToMessage = useCallback(
    async (event: Event): Promise<ChatMessage | null> => {
      if (event.kind === 1) {
        if (room.type === "private") {
          try {
            const decrypted = await decryptMessage(room.id, event.content);
            return {
              id: event.id,
              pubkey: event.pubkey,
              created_at: event.created_at,
              kind: event.kind,
              tags: event.tags,
              content: { type: "text", body: decrypted },
            };
          } catch (decryptError) {
            console.error("Failed to decrypt message", decryptError);
            return {
              id: event.id,
              pubkey: event.pubkey,
              created_at: event.created_at,
              kind: event.kind,
              tags: event.tags,
              content: { type: "text", body: "[Unable to decrypt message]" },
            };
          }
        }

        return {
          id: event.id,
          pubkey: event.pubkey,
          created_at: event.created_at,
          kind: event.kind,
          tags: event.tags,
          content: { type: "text", body: event.content },
        };
      }

      if (event.kind === 1063) {
        const mediaContent = parseMediaEvent(event);
        if (!mediaContent.url) {
          return null;
        }
        return {
          id: event.id,
          pubkey: event.pubkey,
          created_at: event.created_at,
          kind: event.kind,
          tags: event.tags,
          content: mediaContent,
        };
      }

      return null;
    },
    [room.id, room.type],
  );

  const handleIncomingEvent = useCallback(
    async (event: Event) => {
      if (event.kind === 20001) {
        if (event.pubkey === pubkey) return;
        const typingTag = event.tags.find((tag) => tag[0] === "typing" && tag[1] === "1");
        if (typingTag) {
          setTypingUsers((current) => ({ ...current, [event.pubkey]: Date.now() }));
        }
        return;
      }

      const message = await eventToMessage(event);
      if (!message) return;

      setMessages((current) => {
        if (current.some((existing) => existing.id === message.id)) {
          return current;
        }
        return [...current, message].sort((a, b) => a.created_at - b.created_at);
      });

      const cached: CachedMessage = {
        id: event.id,
        roomId: room.id,
        pubkey: event.pubkey,
        content: event.content,
        decrypted: message.content.type === "text" ? message.content.body : undefined,
        created_at: event.created_at,
        kind: event.kind,
        tags: event.tags,
      };
      cacheMessage(cached).catch((cacheError) => {
        console.warn("Failed to cache message", cacheError);
      });
    },
    [eventToMessage, pubkey, room.id],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(prefetched ? false : true);
    setError(null);

    if (!prefetched) {
      (async () => {
        const cached = await getCachedMessages(room.id, 50);
        if (cancelled) return;
        setMessages(cached.map((item) => cachedToMessage(item)));
        setIsLoading(false);
      })();
    }

    const subscription = nostrClient.subscribeToRoom(room.id, (event) => {
      handleIncomingEvent(event).catch((incomingError) => {
        console.error("Failed to process event", incomingError);
      });
    });

    return () => {
      cancelled = true;
      subscription.close();
      setMessages([]);
      objectUrlRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlRef.current.clear();
    };
  }, [handleIncomingEvent, prefetched, room.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTypingUsers((current) => {
        const now = Date.now();
        const next: Record<string, number> = {};
        Object.entries(current).forEach(([key, timestamp]) => {
          if (now - timestamp < 3000) {
            next[key] = timestamp;
          }
        });
        return Object.keys(next).length === Object.keys(current).length ? current : next;
      });
    }, 2000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    let cancelled = false;

    const processMedia = async (message: ChatMessage) => {
      if (message.content.type !== "media") return;
      if (message.content.status !== "idle" && message.content.status !== "loading") return;

      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? { ...item, content: { ...item.content, status: "loading", error: null } }
            : item,
        ),
      );

      try {
        const digest = message.content.digest;
        const cachedPreview = await getCachedPreview(room.id, digest);
        if (cachedPreview) {
          setMessages((current) =>
            current.map((item) =>
              item.id === message.id && item.content.type === "media"
                ? { ...item, content: { ...item.content, previewUrl: cachedPreview } }
                : item,
            ),
          );
        }

        const cachedBlob = await getCachedMediaBlob(room.id, digest);
        if (cachedBlob) {
          const previous = objectUrlRef.current.get(message.id);
          if (previous) {
            URL.revokeObjectURL(previous);
          }
          const objectUrl = URL.createObjectURL(cachedBlob);
          objectUrlRef.current.set(message.id, objectUrl);
          setMessages((current) =>
            current.map((item) =>
              item.id === message.id && item.content.type === "media"
                ? {
                    ...item,
                    content: {
                      ...item.content,
                      fullUrl: objectUrl,
                      status: "ready",
                      previewUrl: item.content.previewUrl ?? cachedPreview,
                    },
                  }
                : item,
            ),
          );
          return;
        }

        const response = await fetch(message.content.url);
        const payload = await response.arrayBuffer();

        let buffer = payload;
        if (room.type === "private" && message.content.iv) {
          if (!roomKeyAvailable) {
            throw new Error("Missing room key for encrypted media");
          }
          const iv = base64ToUint8Array(message.content.iv);
          buffer = await decryptBinary(room.id, payload, iv);
        }

        const blob = new Blob([buffer], { type: message.content.mimeType });
        const preview = message.content.previewUrl ?? (await createPreviewFromBlob(blob));
        if (preview) {
          await setCachedPreview(room.id, digest, preview);
        }
        await setCachedMediaBlob(room.id, digest, blob);

        const previous = objectUrlRef.current.get(message.id);
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current.set(message.id, objectUrl);

        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        setMessages((current) =>
          current.map((item) =>
            item.id === message.id && item.content.type === "media"
              ? {
                  ...item,
                  content: {
                    ...item.content,
                    previewUrl: preview ?? item.content.previewUrl,
                    fullUrl: objectUrl,
                    status: "ready",
                  },
                }
              : item,
          ),
        );
      } catch (mediaError) {
        console.error("Failed to load media", mediaError);
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id && item.content.type === "media"
              ? {
                  ...item,
                  content: {
                    ...item.content,
                    status: "error",
                    error: mediaError instanceof Error ? mediaError.message : String(mediaError),
                  },
                }
              : item,
          ),
        );
      }
    };

    messages
      .filter((message) => message.content.type === "media")
      .forEach((message) => {
        void processMedia(message);
      });

    return () => {
      cancelled = true;
    };
  }, [messages, room.id, room.type, roomKeyAvailable]);

  const applyFlushResults = useCallback(
    (results: Awaited<ReturnType<typeof flushPendingEvents>>) => {
      results.forEach((result) => {
        if (!result.eventId) return;

        let cachedPayload: CachedMessage | null = null;
        setMessages((current) => {
          let decryptedBody: string | undefined;
          const next = current.map((message) => {
            if (message.id !== result.pendingId) return message;
            if (message.content.type === "text") {
              decryptedBody = message.content.body;
            }
            return { ...message, id: result.eventId!, pending: false, offline: false };
          });

          cachedPayload = {
            id: result.eventId!,
            roomId: room.id,
            pubkey: pubkey ?? PUBKEY_FALLBACK,
            content: typeof result.template.content === "string" ? result.template.content : "",
            decrypted: decryptedBody,
            created_at: result.template.created_at ?? Math.floor(Date.now() / 1000),
            kind: result.template.kind ?? 1,
            tags: result.template.tags,
          };

          return next;
        });

        if (cachedPayload) {
          cacheMessage(cachedPayload).catch(() => {});
        }
      });
    },
    [pubkey, room.id],
  );

  useEffect(() => {
    const handleOnline = () => {
      flushPendingEvents((template) => nostrClient.publish(template)).then(applyFlushResults);
    };

    window.addEventListener("online", handleOnline);

    if (navigator.serviceWorker) {
      const listener = (event: MessageEvent) => {
        if (event.data === "nostr-sync" || event.data?.type === "nostr-sync") {
          handleOnline();
        }
      };
      navigator.serviceWorker.addEventListener("message", listener);
      return () => {
        window.removeEventListener("online", handleOnline);
        navigator.serviceWorker.removeEventListener("message", listener);
      };
    }

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [applyFlushResults]);

  const optimisticUpdate = useCallback((message: ChatMessage) => {
    setMessages((current) => [...current, message]);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!pubkey) {
        setError("You need to connect a NIP-07 wallet to send messages.");
        return;
      }

      if (room.type === "private") {
        const keyAvailable = roomKeyAvailable ? true : await hasRoomKey(room.id);
        if (!keyAvailable) {
          setError("Import the room key before sending encrypted messages.");
          return;
        }
      }

      const created_at = Math.floor(Date.now() / 1000);
      const tags = [
        ["t", `room:${room.id}`],
        ["t", `server:${room.id}`],
      ];

      const encryptedContent = room.type === "private" ? await encryptMessage(room.id, text) : text;

      const template: EventTemplate = {
        kind: 1,
        created_at,
        tags,
        content: encryptedContent,
      };

      const tempId = `temp-${Math.random().toString(36).slice(2)}`;
      optimisticUpdate({
        id: tempId,
        pubkey,
        created_at,
        kind: 1,
        tags,
        content: { type: "text", body: text },
        pending: true,
        offline: !navigator.onLine,
      });

      const cachePayload: CachedMessage = {
        id: tempId,
        roomId: room.id,
        pubkey,
        content: encryptedContent,
        decrypted: text,
        created_at,
        kind: 1,
        tags,
      };

      if (!navigator.onLine) {
        const pending: PendingEvent = {
          id: tempId,
          roomId: room.id,
          template,
          createdAt: Date.now(),
        };
        await queuePendingEvent(pending);
        setError("You are offline. Message queued for delivery.");
        return;
      }

      try {
        const signed = await nostrClient.publish(template);
        setMessages((current) =>
          current.map((message) =>
            message.id === tempId
              ? { ...message, id: signed.id, pending: false, offline: false }
              : message,
          ),
        );
        cacheMessage({ ...cachePayload, id: signed.id }).catch(() => {});
      } catch (sendError) {
        console.error(sendError);
        setMessages((current) =>
          current.map((message) =>
            message.id === tempId
              ? { ...message, pending: false, error: "Failed to send" }
              : message,
          ),
        );
        setError("Failed to send message");
      }
    },
    [optimisticUpdate, pubkey, room.id, room.type, roomKeyAvailable],
  );

  const sendTyping = useCallback(async () => {
    if (!pubkey) return;
    const now = Date.now();
    if (now - typingThrottleRef.current < 2000) return;
    typingThrottleRef.current = now;

    const template = {
      kind: 20001,
      created_at: Math.floor(now / 1000),
      content: "typing",
      tags: [
        ["t", `room:${room.id}`],
        ["t", `server:${room.id}`],
        ["typing", "1"],
      ],
    } as const;

    try {
      await nostrClient.publish(template);
    } catch (typingError) {
      console.error("Failed to publish typing event", typingError);
    }
  }, [pubkey, room.id]);

  const activeTypingUsers = useMemo(
    () => Object.keys(typingUsers).filter((key) => typingUsers[key] && key !== pubkey),
    [typingUsers, pubkey],
  );

  const inputDisabled = !pubkey || (room.type === "private" && !roomKeyAvailable);

  return (
    <section className="flex h-full flex-1 flex-col bg-[var(--bg-app)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-4">
        <h1 className="text-lg font-bold uppercase tracking-[0.24em] text-[var(--fg-default)]">{room.name}</h1>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--fg-muted)]">
          #{room.type === "private" ? `server:${room.id} (encrypted)` : `room:${room.id}`}
        </p>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {isLoading && <p className="text-sm text-[var(--fg-muted)]">Loading messages…</p>}
          {!isLoading && messages.length === 0 && (
            <p className="text-sm text-[var(--fg-muted)]">No messages yet. Say hello!</p>
          )}
          {messages.map((message) => {
            const isMedia = message.content.type === "media";
            return (
              <div key={message.id} className="rounded-xl bg-[var(--bg-card)] p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--fg-muted)]">
                  <span>{formatPubkey(message.pubkey || PUBKEY_FALLBACK)}</span>
                  <span>{new Date(message.created_at * 1000).toLocaleTimeString()}</span>
                </div>
                {isMedia ? (
                  <div className="mt-2 space-y-2">
                    {message.content.previewUrl && (
                      <img
                        src={message.content.previewUrl}
                        alt="Media preview"
                        className={`max-h-48 w-full rounded-lg object-cover ${message.content.status !== "ready" ? "opacity-60" : ""}`}
                      />
                    )}
                    {message.content.status === "ready" && message.content.fullUrl && (
                      <a
                        href={message.content.fullUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg border border-[var(--border-subtle)]"
                      >
                        {message.content.mimeType.startsWith("video/") ? (
                          <video
                            src={message.content.fullUrl}
                            controls
                            className="max-h-64 w-full"
                          />
                        ) : (
                          <img
                            src={message.content.fullUrl}
                            alt="Uploaded media"
                            className="w-full object-contain"
                          />
                        )}
                      </a>
                    )}
                    {message.content.status === "loading" && (
                      <p className="text-xs text-[var(--fg-muted)]">Fetching media…</p>
                    )}
                    {message.content.status === "error" && (
                      <p className="text-xs text-red-500">{message.content.error ?? "Unable to load media"}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--fg-default)]">
                    {message.content.body}
                  </p>
                )}
                {message.pending && (
                  <p className="mt-2 text-xs text-brand">
                    {message.offline ? "Queued for sync…" : "Sending…"}
                  </p>
                )}
                {message.error && <p className="mt-2 text-xs text-red-500">{message.error}</p>}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {room.type === "private" && !roomKeyAvailable && (
          <div className="px-6 pb-2 text-xs text-[var(--fg-muted)]">
            Import the room key from a trusted member to decrypt and send messages.
          </div>
        )}

        {activeTypingUsers.length > 0 && (
          <div className="px-6 pb-2 text-xs text-[var(--fg-muted)]">
            {activeTypingUsers.map((key) => formatPubkey(key)).join(", ")} typing…
          </div>
        )}

        {error && <div className="px-6 pb-2 text-xs text-red-500">{error}</div>}

        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-4">
          <MessageInput onSend={sendMessage} onTyping={sendTyping} disabled={inputDisabled} />
        </div>
      </div>
    </section>
  );
};

export default ChatRoom;
