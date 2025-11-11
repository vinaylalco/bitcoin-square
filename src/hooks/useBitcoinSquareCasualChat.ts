import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventTemplate } from "../lib/nostrToolsShim";

import { NostrRelayManager } from "../lib/nostrRelayManager";
import { getConfiguredRoomKey } from "../config/nostr";
import { cacheMessage, getCachedMessages, removeCachedMessages, type CachedMessage } from "../utils/chatCache";
import { decryptChannelText, encryptChannelText } from "../utils/channelEncryption";
import { markdownToHtml, stripImagePlaceholders } from "../utils/markdown";
import { useRoomKey } from "./useRoomKey";
import { useNostrAccount } from "./useNostrAccount";
import { useAuth } from "../context/AuthContext";
import { getBrowserLanguageTag } from "../utils/browserLanguage";

const ROOM_ID = "bitcoinsquare-casual";
const ROOM_TAG = `room:${ROOM_ID}`;
const ROOM_NAME = "BitcoinSquare Chat";
const DELETED_MESSAGE_STORAGE_KEY = "bitcoinsquare-chat-deleted";
const BROWSER_LANGUAGE_TAG = getBrowserLanguageTag();

const FAST_RELAY = "wss://relay.damus.io";
const ADDITIONAL_RELAYS = ["wss://relay.primal.net", "wss://nos.lol", "wss://relay.nostr.band"];

const MAX_MESSAGES = 400;
const TYPING_TIMEOUT_MS = 6000;
const TYPING_THROTTLE_MS = 2000;

interface CasualAttachmentMeta {
  eventId?: string | null;
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
  quoteId?: string;
  quotePubkey?: string;
  likePubkeys: string[];
}

export interface UseBitcoinSquareCasualChatResult {
  roomId: string;
  roomName: string;
  messages: CasualChatMessage[];
  sendMessage: (
    body: string,
    attachments?: CasualAttachmentMeta[],
    options?: { quoteId?: string | null; quotePubkey?: string | null },
  ) => Promise<string>;
  likeMessage: (message: CasualChatMessage) => Promise<void>;
  deleteMessage: (message: CasualChatMessage) => Promise<void>;
  pubkey: string | null;
  loading: boolean;
  ready: boolean;
  hasRoomKey: boolean;
  roomKeyError: string | null;
  error: string | null;
  typingPubkeys: string[];
  sendTyping: () => Promise<void>;
}

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

const dedupePubkeys = (values: string[] = []) =>
  Array.from(
    new Set(
      values.filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );

const mergeLikePubkeys = (existing: string[], incoming: string[] = []) => {
  const combined = new Set(existing);
  incoming.forEach((value) => {
    if (typeof value === "string" && value.trim().length > 0) {
      combined.add(value);
    }
  });
  return Array.from(combined);
};

const upsertMessage = (messages: CasualChatMessage[], incoming: CasualChatMessage) => {
  const normalizedIncoming: CasualChatMessage = {
    ...incoming,
    likePubkeys: dedupePubkeys(incoming.likePubkeys),
  };
  const index = messages.findIndex((message) => message.id === normalizedIncoming.id);
  if (index >= 0) {
    const next = [...messages];
    next[index] = {
      ...next[index],
      ...normalizedIncoming,
      likePubkeys: mergeLikePubkeys(next[index].likePubkeys, normalizedIncoming.likePubkeys),
      status: normalizedIncoming.status ?? next[index].status,
      optimistic: normalizedIncoming.optimistic,
    };
    return next.sort((a, b) => a.created_at - b.created_at).slice(-MAX_MESSAGES);
  }

  const normalized = {
    ...normalizedIncoming,
    likePubkeys: dedupePubkeys(normalizedIncoming.likePubkeys),
  };

  return [...messages, normalized]
    .sort((a, b) => a.created_at - b.created_at)
    .slice(-MAX_MESSAGES);
};

const cachedToMessage = (cached: CachedMessage): CasualChatMessage | null => {
  if (!cached.decrypted) return null;
  const payload = parsePayload(cached.decrypted);
  const sanitizedBody = stripImagePlaceholders(payload.body);
  const body = sanitizedBody.trim();
  const html = markdownToHtml(body);
  const quoteTag =
    cached.tags?.find((tag) => tag[0] === "e" && tag[3] === "reply") ??
    cached.tags?.find((tag) => tag[0] === "q");
  const quoteId = quoteTag && typeof quoteTag[1] === "string" ? quoteTag[1] : undefined;
  const quotePubkeyTag = cached.tags?.find((tag) => tag[0] === "p");
  const quotePubkey = quotePubkeyTag && typeof quotePubkeyTag[1] === "string" ? quotePubkeyTag[1] : undefined;

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
    quoteId,
    quotePubkey,
    likePubkeys: [],
  };
};

const isLikeReaction = (content: string | undefined) => {
  if (!content) return false;
  const trimmed = content.trim();
  return trimmed === "+" || trimmed === "❤️" || trimmed === "❤" || trimmed === "♥" || trimmed === "♥️";
};

const addLikeToMessages = (messages: CasualChatMessage[], messageId: string, pubkey: string) => {
  let found = false;
  let changed = false;
  const next = messages.map((message) => {
    if (message.id !== messageId) return message;
    found = true;
    if (message.likePubkeys.includes(pubkey)) {
      return message;
    }
    changed = true;
    return { ...message, likePubkeys: [...message.likePubkeys, pubkey] };
  });
  return { next: changed ? next : messages, found, changed };
};

const removeLikeFromMessages = (messages: CasualChatMessage[], messageId: string, pubkey: string) => {
  let found = false;
  let changed = false;
  const next = messages.map((message) => {
    if (message.id !== messageId) return message;
    found = true;
    if (!message.likePubkeys.includes(pubkey)) {
      return message;
    }
    changed = true;
    return {
      ...message,
      likePubkeys: message.likePubkeys.filter((value) => value !== pubkey),
    };
  });
  return { next: changed ? next : messages, found, changed };
};

export const useBitcoinSquareCasualChat = (): UseBitcoinSquareCasualChatResult => {
  const [messages, setMessages] = useState<CasualChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const managerRef = useRef<NostrRelayManager | null>(null);
  const visibilityRef = useRef(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const notificationsEnabledRef = useRef(false);
  const notificationGateRef = useRef(false);
  const refreshedKeyRef = useRef(false);
  const typingThrottleRef = useRef(0);
  const pendingLikesRef = useRef(new Map<string, Set<string>>());
  const deletedMessageIdsRef = useRef(new Set<string>());
  const deletedMessageStorageHydratedRef = useRef(false);

  const configuredRoomKey = getConfiguredRoomKey(ROOM_ID);

  const { hasKey, error: roomKeyError, refresh: refreshKey } = useRoomKey({
    roomId: ROOM_ID,
    isPrivate: true,
    seedBase64: configuredRoomKey,
  });

  const { ready: accountReady, pubkey, signEvent } = useNostrAccount();
  const { user } = useAuth();
  const canModerate = user?.isAdmin === true;

  const ensureDeletedMessagesHydrated = useCallback(() => {
    if (deletedMessageStorageHydratedRef.current) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(DELETED_MESSAGE_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        parsed.forEach((value) => {
          if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed.length > 0) {
              deletedMessageIdsRef.current.add(trimmed);
            }
          }
        });
      }
    } catch (storageError) {
      console.warn("Failed to restore deleted chat messages", storageError);
    } finally {
      deletedMessageStorageHydratedRef.current = true;
    }
  }, []);

  const persistDeletedMessages = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const serialized = JSON.stringify(Array.from(deletedMessageIdsRef.current));
      window.localStorage.setItem(DELETED_MESSAGE_STORAGE_KEY, serialized);
    } catch (storageError) {
      console.warn("Failed to persist deleted chat messages", storageError);
    }
  }, []);

  useEffect(() => {
    if (!configuredRoomKey) {
      setError(
        "Shared room key is not configured. Set VITE_ROOM_KEY_BITCOINSQUARE_CASUAL (or legacy VITE_CASUAL_ROOM_KEY) or define window.__BITCOINSQUARE_CONFIG__.roomKeys[\"bitcoinsquare-casual\"].",
      );
    }
  }, [configuredRoomKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    notificationsEnabledRef.current = Notification.permission === "granted";
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
    ensureDeletedMessagesHydrated();
    let cancelled = false;
    setLoading(true);
    getCachedMessages(ROOM_ID, 60)
      .then((cached) => {
        if (cancelled) return;
        const pendingLikes = new Map<string, Set<string>>();
        const messageMap = new Map<string, CasualChatMessage>();
        const restored: CasualChatMessage[] = [];

        cached.forEach((item) => {
          if (item.kind === 7) {
            if (!isLikeReaction(item.content)) {
              return;
            }
            const targetTag = item.tags?.find((tag) => tag[0] === "e");
            const targetId = targetTag && typeof targetTag[1] === "string" ? targetTag[1] : null;
            if (!targetId) return;
            const reactor = item.pubkey;
            if (!reactor) return;
            const existing = messageMap.get(targetId);
            if (existing) {
              if (!existing.likePubkeys.includes(reactor)) {
                existing.likePubkeys = [...existing.likePubkeys, reactor];
              }
              return;
            }
            const set = pendingLikes.get(targetId) ?? new Set<string>();
            set.add(reactor);
            pendingLikes.set(targetId, set);
            return;
          }

          const message = cachedToMessage(item);
          if (!message) return;
          if (deletedMessageIdsRef.current.has(message.id)) {
            return;
          }
          const likes = pendingLikes.get(message.id);
          const messageWithLikes = likes
            ? { ...message, likePubkeys: Array.from(likes) }
            : message;
          if (likes) {
            pendingLikes.delete(message.id);
          }
          restored.push(messageWithLikes);
          messageMap.set(message.id, messageWithLikes);
        });

        pendingLikesRef.current = pendingLikes;
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
  }, [ensureDeletedMessagesHydrated]);

  useEffect(() => {
    ensureDeletedMessagesHydrated();
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
        ensureDeletedMessagesHydrated();
        void (async () => {
          if (!event.tags.some((tag) => tag[0] === "t" && tag[1] === ROOM_TAG)) {
            return;
          }
          try {
            const plaintext = await decryptChannelText(ROOM_ID, event.content);
            const payload = parsePayload(plaintext);
            const sanitizedBody = stripImagePlaceholders(payload.body);
            const body = sanitizedBody.trim();
            const html = markdownToHtml(body);
            const attachments = payload.attachments ?? [];
            const quoteTag =
              event.tags?.find((tag) => tag[0] === "e" && tag[3] === "reply") ??
              event.tags?.find((tag) => tag[0] === "q");
            const quoteId = quoteTag && typeof quoteTag[1] === "string" ? quoteTag[1] : undefined;
            const quotePubkeyTag = event.tags?.find((tag) => tag[0] === "p");
            const quotePubkey =
              quotePubkeyTag && typeof quotePubkeyTag[1] === "string" ? quotePubkeyTag[1] : undefined;

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
              quoteId,
              quotePubkey,
              likePubkeys: [],
            };

            if (deletedMessageIdsRef.current.has(message.id)) {
              return;
            }

            const pendingLikes = pendingLikesRef.current.get(message.id);
            if (pendingLikes && pendingLikes.size > 0) {
              message.likePubkeys = Array.from(pendingLikes);
              pendingLikesRef.current.delete(message.id);
            }

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

    const typingSubscription = manager.subscribe(
      {
        kinds: [20001],
        "#t": [ROOM_TAG],
      },
      (event) => {
        if (!event.tags?.some((tag) => tag[0] === "typing")) return;
        setTypingUsers((prev) => ({ ...prev, [event.pubkey]: Date.now() + TYPING_TIMEOUT_MS }));
      },
    );

    const reactionSubscription = manager.subscribe(
      {
        kinds: [7],
        "#t": [ROOM_TAG],
      },
      (event) => {
        ensureDeletedMessagesHydrated();
        if (!isLikeReaction(event.content)) {
          return;
        }
        const targetTag = event.tags?.find((tag) => tag[0] === "e");
        const targetId = targetTag && typeof targetTag[1] === "string" ? targetTag[1] : null;
        if (!targetId) return;
        const reactor = event.pubkey;
        if (!reactor) return;
        if (deletedMessageIdsRef.current.has(targetId)) {
          return;
        }

        let found = false;
        setMessages((prev) => {
          const { next, found: messageFound, changed } = addLikeToMessages(prev, targetId, reactor);
          found = messageFound;
          if (!changed) {
            return prev;
          }
          return next;
        });

        if (!found) {
          const pending = pendingLikesRef.current.get(targetId) ?? new Set<string>();
          pending.add(reactor);
          pendingLikesRef.current.set(targetId, pending);
        }

        const cached: CachedMessage = {
          id: event.id,
          roomId: ROOM_ID,
          pubkey: event.pubkey,
          content: event.content,
          created_at: event.created_at,
          kind: event.kind,
          tags: event.tags,
          sig: event.sig,
        };
        cacheMessage(cached).catch((cacheError) => {
          console.warn("Failed to cache reaction", cacheError);
        });
      },
    );

    const deletionSubscription = manager.subscribe(
      {
        kinds: [5],
        "#t": [ROOM_TAG],
      },
      (event) => {
        ensureDeletedMessagesHydrated();
        const targetIds = event.tags
          ?.filter((tag) => Array.isArray(tag) && tag[0] === "e" && typeof tag[1] === "string")
          .map((tag) => tag[1].trim())
          .filter((value) => value.length > 0);
        if (!targetIds || targetIds.length === 0) {
          return;
        }

        const targets = new Set(targetIds);
        targetIds.forEach((id) => {
          deletedMessageIdsRef.current.add(id);
          pendingLikesRef.current.delete(id);
        });
        persistDeletedMessages();

        setMessages((prev) => {
          const filtered = prev.filter((message) => !targets.has(message.id));
          if (filtered.length === prev.length) {
            return prev;
          }
          return filtered;
        });

        removeCachedMessages(ROOM_ID, targetIds).catch((cacheError) => {
          console.warn("Failed to remove deleted casual chat messages", cacheError);
        });
      },
    );

    return () => {
      subscription.close();
      typingSubscription.close();
      reactionSubscription.close();
      deletionSubscription.close();
      manager.close();
      managerRef.current = null;
    };
  }, [ensureDeletedMessagesHydrated, persistDeletedMessages, pubkey]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const interval = window.setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        let changed = false;
        const next: Record<string, number> = {};
        Object.entries(prev).forEach(([key, expires]) => {
          if (expires > now) {
            next[key] = expires;
          } else {
            changed = true;
          }
        });
        if (!changed && Object.keys(prev).length === Object.keys(next).length) {
          return prev;
        }
        return next;
      });
    }, 2000);
    return () => window.clearInterval(interval);
  }, []);

  const sendMessage = useCallback(
    async (
      body: string,
      attachments: CasualAttachmentMeta[] = [],
      options?: { quoteId?: string | null },
    ) => {
      const trimmed = body.trim();
      const cleanedBody = stripImagePlaceholders(trimmed);
      if (!cleanedBody && attachments.length === 0) {
        throw new Error("Message cannot be empty");
      }
      if (cleanedBody.length > 500) {
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
        body: cleanedBody,
        attachments,
      };
      const plaintext = JSON.stringify(payload);
      const content = await encryptChannelText(ROOM_ID, plaintext);

      const created_at = Math.floor(Date.now() / 1000);
      const tags: string[][] = [
        ["t", ROOM_TAG],
        ["lang", BROWSER_LANGUAGE_TAG],
      ];

      if (options?.quoteId) {
        tags.push(["e", options.quoteId, "", "reply"]);
      }
      if (options?.quotePubkey) {
        tags.push(["p", options.quotePubkey]);
      }

      attachments.forEach((attachment) => {
        const eventId =
          typeof attachment.eventId === "string" && attachment.eventId.trim().length > 0
            ? attachment.eventId.trim()
            : null;
        const digest =
          typeof attachment.digest === "string" && attachment.digest.trim().length > 0
            ? attachment.digest.trim()
            : null;
        const url =
          typeof attachment.url === "string" && attachment.url.trim().length > 0
            ? attachment.url.trim()
            : null;

        if (eventId) {
          tags.push(["e", eventId, "", "media"]);
        }
        if (digest) {
          tags.push(["x", digest]);
        }
        if (url) {
          tags.push(["r", url]);
        }
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
        markdown: cleanedBody,
        body: cleanedBody,
        html: markdownToHtml(cleanedBody),
        attachments,
        tags: signed.tags ?? tags,
        status: "pending",
        optimistic: true,
        quoteId: options?.quoteId ?? undefined,
        quotePubkey: options?.quotePubkey ?? undefined,
        likePubkeys: [],
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

      return signed.id;
    },
    [hasKey, signEvent],
  );

  const likeMessage = useCallback(
    async (message: CasualChatMessage) => {
      if (!signEvent) {
        throw new Error("Your Nostr keys are not ready yet");
      }
      if (!pubkey) {
        throw new Error("Your Nostr keys are not ready yet");
      }
      if (message.likePubkeys.includes(pubkey)) {
        return;
      }
      const manager = managerRef.current;
      if (!manager) {
        throw new Error("Relay manager not ready yet");
      }

      const template: EventTemplate = {
        kind: 7,
        created_at: Math.floor(Date.now() / 1000),
        content: "+",
        tags: [
          ["e", message.id],
          ["p", message.pubkey],
          ["t", ROOM_TAG],
          ["app", "BitcoinSquare"],
          ["chat", ROOM_TAG],
        ],
      };

      const signed = await signEvent(template);
      const reactor = signed.pubkey;

      let found = false;
      setMessages((prev) => {
        const { next, found: messageFound, changed } = addLikeToMessages(prev, message.id, reactor);
        found = messageFound;
        if (!changed) {
          return prev;
        }
        return next;
      });

      if (!found) {
        const pending = pendingLikesRef.current.get(message.id) ?? new Set<string>();
        pending.add(reactor);
        pendingLikesRef.current.set(message.id, pending);
      }

      setError(null);

      const { ack } = manager.publish(signed);

      try {
        await ack;
        const cached: CachedMessage = {
          id: signed.id,
          roomId: ROOM_ID,
          pubkey: signed.pubkey,
          content: signed.content,
          created_at: signed.created_at,
          kind: signed.kind,
          tags: signed.tags,
          sig: signed.sig,
        };
        cacheMessage(cached).catch((cacheError) => {
          console.warn("Failed to cache like", cacheError);
        });
      } catch (publishError) {
        setMessages((prev) => {
          const { next, changed } = removeLikeFromMessages(prev, message.id, reactor);
          if (!changed) {
            return prev;
          }
          return next;
        });
        throw publishError;
      }
    },
    [pubkey, signEvent],
  );

  const deleteMessage = useCallback(
    async (message: CasualChatMessage) => {
      if (!canModerate) {
        throw new Error("Only admins can delete messages.");
      }
      if (!signEvent) {
        throw new Error("Your Nostr keys are not ready yet");
      }
      const manager = managerRef.current;
      if (!manager) {
        throw new Error("Relay manager not ready yet");
      }

      ensureDeletedMessagesHydrated();
      const id = message.id;
      deletedMessageIdsRef.current.add(id);
      pendingLikesRef.current.delete(id);
      setMessages((prev) => prev.filter((entry) => entry.id !== id));
      persistDeletedMessages();

      try {
        const template: EventTemplate = {
          kind: 5,
          created_at: Math.floor(Date.now() / 1000),
          content: "",
          tags: [
            ["e", id],
            ["p", message.pubkey],
            ["t", ROOM_TAG],
            ["app", "BitcoinSquare"],
            ["chat", ROOM_TAG],
          ],
        };

        const signed = await signEvent(template);
        const { ack } = manager.publish(signed);
        await ack;

        removeCachedMessages(ROOM_ID, [id]).catch((cacheError) => {
          console.warn("Failed to clear deleted casual chat message from cache", cacheError);
        });
      } catch (deleteError) {
        deletedMessageIdsRef.current.delete(id);
        setMessages((prev) => upsertMessage(prev, message));
        persistDeletedMessages();
        setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
        throw deleteError;
      }
    },
    [canModerate, ensureDeletedMessagesHydrated, persistDeletedMessages, signEvent],
  );

  const ready = useMemo(
    () => hasKey && Boolean(pubkey) && Boolean(managerRef.current) && accountReady,
    [accountReady, hasKey, pubkey],
  );

  const typingPubkeys = useMemo(
    () =>
      Object.entries(typingUsers)
        .filter(([, expires]) => expires > Date.now())
        .map(([key]) => key),
    [typingUsers],
  );

  const sendTyping = useCallback(async () => {
    if (!signEvent) return;
    if (!managerRef.current) return;
    const now = Date.now();
    if (now - typingThrottleRef.current < TYPING_THROTTLE_MS) return;
    typingThrottleRef.current = now;
    try {
      const template: EventTemplate = {
        kind: 20001,
        created_at: Math.floor(now / 1000),
        content: "typing",
        tags: [["t", ROOM_TAG], ["typing", "1"]],
      };
      const signed = await signEvent(template);
      managerRef.current.publish(signed);
    } catch (typingError) {
      console.warn("Failed to publish typing event", typingError);
    }
  }, [signEvent]);

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
    likeMessage,
    deleteMessage,
    pubkey,
    loading,
    ready,
    hasRoomKey: hasKey,
    roomKeyError,
    error,
    typingPubkeys,
    sendTyping,
  };
};

export type { CasualAttachmentMeta };
export { ROOM_ID as CASUAL_ROOM_ID, ROOM_TAG as CASUAL_ROOM_TAG, ROOM_NAME as CASUAL_ROOM_NAME };
