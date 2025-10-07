import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventTemplate } from "nostr-tools";

import { NostrRelayManager } from "../lib/nostrRelayManager";
import { cacheMessage, getCachedMessages, type CachedMessage } from "../utils/chatCache";
import {
  decryptMessage,
  encryptMessage,
} from "../utils/aes";
import { useRoomKey } from "./useRoomKey";
import { useNostrAccount } from "./useNostrAccount";

const ROOM_ID = "bitcoinsquare-casual";
const ROOM_TAG = `room:${ROOM_ID}`;
const ROOM_NAME = "BitcoinSquare Casual Chat";

const FAST_RELAY = "wss://relay.damus.io";
const ADDITIONAL_RELAYS = ["wss://relay.primal.net", "wss://nos.lol", "wss://eden.nostr.land"];

const MAX_MESSAGES = 400;

interface CasualAttachmentMeta {
  eventId: string;
  url: string;
  mimeType: string;
  size: number;
  digest: string;
  width?: number;
  height?: number;
  iv?: string;
}

interface CasualPayload {
  version?: number;
  body: string;
  attachments?: CasualAttachmentMeta[];
}

export interface CasualChatMessage {
  id: string;
  pubkey: string;
  created_at: number;
  body: string;
  html: string;
  markdown: string;
  attachments: CasualAttachmentMeta[];
  tags: string[][];
  status: "pending" | "ok" | "failed";
  optimistic: boolean;
  error?: string;
}

export interface UseBitcoinSquareCasualChatResult {
  roomId: string;
  roomName: string;
  messages: CasualChatMessage[];
  sendMessage: (body: string, attachments?: CasualAttachmentMeta[]) => Promise<void>;
  pubkey: string | null;
  loading: boolean;
  ready: boolean;
  hasRoomKey: boolean;
  roomKeyError: string | null;
  error: string | null;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const markdownToHtml = (input: string) => {
  const escaped = escapeHtml(input);

  const withBlockquotes = escaped.replace(/^&gt;\s?(.*)$/gm, "<blockquote>$1</blockquote>");
  const withHeaders = withBlockquotes.replace(/^(#{1,3})\s+(.+)$/gm, (_, hashes: string, title: string) => {
    const level = hashes.length;
    return `<h${level}>${title}</h${level}>`;
  });

  const withCode = withHeaders.replace(/`([^`]+)`/g, "<code>$1</code>");
  const withBold = withCode
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>");

  const withItalics = withBold
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>");

  const withStrike = withItalics.replace(/~~(.+?)~~/g, "<del>$1</del>");

  const withLinks = withStrike
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(
      /(https?:\/\/[^\s<]+[^\s<\.)])/g,
      '<a href="$1" target="_blank" rel="noreferrer">$1</a>',
    );

  return withLinks.replace(/\n/g, "<br />");
};

const parsePayload = (plaintext: string): CasualPayload => {
  try {
    const parsed = JSON.parse(plaintext) as CasualPayload;
    if (!parsed || typeof parsed.body !== "string") {
      return { body: plaintext };
    }
    return {
      body: parsed.body,
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      version: parsed.version,
    };
  } catch (error) {
    console.warn("Failed to parse casual chat payload", error);
    return { body: plaintext };
  }
};

const upsertMessage = (messages: CasualChatMessage[], incoming: CasualChatMessage) => {
  const index = messages.findIndex((message) => message.id === incoming.id);
  if (index >= 0) {
    const next = [...messages];
    next[index] = {
      ...next[index],
      ...incoming,
      status: incoming.status ?? next[index].status,
      optimistic: incoming.optimistic,
    };
    return next.sort((a, b) => a.created_at - b.created_at).slice(-MAX_MESSAGES);
  }

  return [...messages, incoming]
    .sort((a, b) => a.created_at - b.created_at)
    .slice(-MAX_MESSAGES);
};

const cachedToMessage = (cached: CachedMessage): CasualChatMessage | null => {
  if (!cached.decrypted) return null;
  const payload = parsePayload(cached.decrypted);
  const body = payload.body.trim();
  const html = markdownToHtml(body);

  return {
    id: cached.id,
    pubkey: cached.pubkey,
    created_at: cached.created_at,
    markdown: body,
    body,
    html,
    attachments: payload.attachments ?? [],
    tags: cached.tags ?? [],
    status: "ok",
    optimistic: false,
  };
};

export const useBitcoinSquareCasualChat = (): UseBitcoinSquareCasualChatResult => {
  const [messages, setMessages] = useState<CasualChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const managerRef = useRef<NostrRelayManager | null>(null);
  const visibilityRef = useRef(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const notificationsEnabledRef = useRef(false);
  const notificationGateRef = useRef(false);
  const refreshedKeyRef = useRef(false);

  const envRoomKey = import.meta.env.VITE_CASUAL_ROOM_KEY ?? null;

  const { hasKey, error: roomKeyError, refresh: refreshKey } = useRoomKey({
    roomId: ROOM_ID,
    isPrivate: true,
    seedBase64: envRoomKey,
  });

  const { ready: accountReady, pubkey, signEvent } = useNostrAccount();

  useEffect(() => {
    if (!envRoomKey) {
      setError("Shared room key is not configured. Please contact BitcoinSquare support.");
    }
  }, [envRoomKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    notificationsEnabledRef.current = Notification.permission === "granted";
    if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        notificationsEnabledRef.current = permission === "granted";
      });
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => {
      visibilityRef.current = !document.hidden;
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      notificationGateRef.current = true;
    }, 2000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCachedMessages(ROOM_ID, 60)
      .then((cached) => {
        if (cancelled) return;
        const restored = cached
          .map((item) => cachedToMessage(item))
          .filter((item): item is CasualChatMessage => Boolean(item));
        setMessages(restored);
      })
      .catch((cacheError) => {
        console.warn("Failed to hydrate cached messages", cacheError);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const manager = new NostrRelayManager({
      fastRelay: FAST_RELAY,
      additionalRelays: ADDITIONAL_RELAYS,
    });
    managerRef.current = manager;

    const subscription = manager.subscribe(
      {
        kinds: [1],
        "#t": [ROOM_TAG],
      },
      (event) => {
        void (async () => {
          if (!event.tags.some((tag) => tag[0] === "t" && tag[1] === ROOM_TAG)) {
            return;
          }
          try {
            const plaintext = await decryptMessage(ROOM_ID, event.content);
            const payload = parsePayload(plaintext);
            const body = payload.body.trim();
            const html = markdownToHtml(body);
            const attachments = payload.attachments ?? [];

            const message: CasualChatMessage = {
              id: event.id,
              pubkey: event.pubkey,
              created_at: event.created_at,
              markdown: body,
              body,
              html,
              attachments,
              tags: event.tags ?? [],
              status: "ok",
              optimistic: false,
            };

            setMessages((prev) => upsertMessage(prev, message));

            const cached: CachedMessage = {
              id: event.id,
              roomId: ROOM_ID,
              pubkey: event.pubkey,
              content: event.content,
              decrypted: JSON.stringify({ ...payload, body }),
              created_at: event.created_at,
              kind: event.kind,
              tags: event.tags,
            };
            cacheMessage(cached).catch((cacheError) => {
              console.warn("Failed to cache message", cacheError);
            });

            if (
              notificationsEnabledRef.current &&
              notificationGateRef.current &&
              !visibilityRef.current &&
              event.pubkey !== (pubkey ?? "")
            ) {
              try {
                new Notification("New casual chat message", {
                  body: body.slice(0, 120),
                });
              } catch (notificationError) {
                console.warn("Notification failed", notificationError);
              }
            }
          } catch (decryptError) {
            console.warn("Failed to decrypt incoming event", decryptError);
          }
        })();
      },
    );

    return () => {
      subscription.close();
      manager.close();
      managerRef.current = null;
    };
  }, [pubkey]);

  const sendMessage = useCallback(
    async (body: string, attachments: CasualAttachmentMeta[] = []) => {
      const trimmed = body.trim();
      if (!trimmed) {
        throw new Error("Message cannot be empty");
      }
      if (trimmed.length > 500) {
        throw new Error("Messages are limited to 500 characters");
      }
      if (!signEvent) {
        throw new Error("Your Nostr keys are not ready yet");
      }
      if (!hasKey) {
        throw new Error("Room key is not available. Please contact support.");
      }
      const manager = managerRef.current;
      if (!manager) {
        throw new Error("Relay manager not ready yet");
      }

      const payload: CasualPayload = {
        version: 1,
        body: trimmed,
        attachments,
      };
      const plaintext = JSON.stringify(payload);
      const content = await encryptMessage(ROOM_ID, plaintext);

      const created_at = Math.floor(Date.now() / 1000);
      const tags: string[][] = [
        ["t", ROOM_TAG],
      ];

      attachments.forEach((attachment) => {
        tags.push(["e", attachment.eventId, "", "media"]);
        tags.push(["x", attachment.digest]);
        tags.push(["r", attachment.url]);
      });

      const template: EventTemplate = {
        kind: 1,
        created_at,
        content,
        tags,
      };

      const signed = await signEvent(template);
      const optimisticMessage: CasualChatMessage = {
        id: signed.id,
        pubkey: signed.pubkey,
        created_at,
        markdown: trimmed,
        body: trimmed,
        html: markdownToHtml(trimmed),
        attachments,
        tags: signed.tags ?? tags,
        status: "pending",
        optimistic: true,
      };

      setMessages((prev) => upsertMessage(prev, optimisticMessage));

      setError(null);

      const { ack } = manager.publish(signed);

      ack
        .then(() => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === signed.id
                ? { ...message, status: "ok", optimistic: false }
                : message,
            ),
          );
          const cached: CachedMessage = {
            id: signed.id,
            roomId: ROOM_ID,
            pubkey: signed.pubkey,
            content: signed.content,
            decrypted: plaintext,
            created_at,
            kind: signed.kind,
            tags: signed.tags ?? tags,
          };
          cacheMessage(cached).catch((cacheError) => {
            console.warn("Failed to cache optimistic message", cacheError);
          });
        })
        .catch((publishError) => {
          console.error("Failed to publish message", publishError);
          setMessages((prev) =>
            prev.map((message) =>
              message.id === signed.id
                ? {
                    ...message,
                    status: "failed",
                    optimistic: false,
                    error: publishError instanceof Error ? publishError.message : String(publishError),
                  }
                : message,
            ),
          );
          setError(publishError instanceof Error ? publishError.message : String(publishError));
        });
    },
    [hasKey, signEvent],
  );

  const ready = useMemo(
    () => hasKey && Boolean(pubkey) && Boolean(managerRef.current) && accountReady,
    [accountReady, hasKey, pubkey],
  );

  useEffect(() => {
    if (!hasKey || refreshedKeyRef.current) return;
    refreshedKeyRef.current = true;
    void refreshKey();
  }, [hasKey, refreshKey]);

  return {
    roomId: ROOM_ID,
    roomName: ROOM_NAME,
    messages,
    sendMessage,
    pubkey,
    loading,
    ready,
    hasRoomKey: hasKey,
    roomKeyError,
    error,
  };
};

export type { CasualAttachmentMeta };
export { ROOM_ID as CASUAL_ROOM_ID, ROOM_TAG as CASUAL_ROOM_TAG, ROOM_NAME as CASUAL_ROOM_NAME };
