/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useAuth } from "./AuthContext";
import { useNostrAccount } from "../hooks/useNostrAccount";
import { publishWithPool } from "../lib/nostrPublish";
import { SimplePool, type Event, type EventTemplate } from "../lib/nostrToolsShim";
import { useProfileIdentity } from "./ProfileIdentityContext";
import { decryptDirectMessage, encryptDirectMessage } from "../utils/directMessageEncryption";
import { isCommunityMessagesLocation } from "../utils/routes";
import { getBrowserLanguageTag } from "../utils/browserLanguage";
import { normalizeLocale } from "../utils/locale";
import { extractLanguageTag } from "../utils/nostrLanguage";
import { strapiFetch } from "../api/strapi-client";

const DM_RELAYS = ["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol"];
const PORTAL_ELEMENT_ID = "direct-message-root";
const BROWSER_LANGUAGE_TAG = getBrowserLanguageTag();
const DEFAULT_LANGUAGE_TAG = normalizeLocale(BROWSER_LANGUAGE_TAG) ?? BROWSER_LANGUAGE_TAG;

export type DirectMessageStatus = "pending" | "sent" | "received" | "failed";

export interface DirectMessageEntry {
  id: string;
  clientId?: string;
  createdAt: number;
  plaintext: string;
  language?: string | null;
  direction: "incoming" | "outgoing";
  status: DirectMessageStatus;
  error?: string | null;
  replyToId?: string | null;
}

export interface DirectMessageConversation {
  peerPubkey: string;
  messages: DirectMessageEntry[];
  unreadCount: number;
  error: string | null;
}

interface DirectMessageContextValue {
  activeConversation: string | null;
  conversations: Record<string, DirectMessageConversation>;
  inboxLastViewed: InboxLastViewed;
  hasUnreadMessages: boolean;
  ready: boolean;
  error: string | null;
  openConversation: (pubkey: string) => void;
  closeConversation: () => void;
  sendMessage: (
    pubkey: string,
    body: string,
    options?: { replyToId?: string | null },
  ) => Promise<void>;
  markAsRead: (pubkey: string) => void;
  markInboxAsViewed: () => void;
  getDraft: (pubkey: string) => string;
  setDraft: (pubkey: string, value: string) => void;
}

const DirectMessageContext = createContext<DirectMessageContextValue | null>(null);

interface InboxLastViewed {
  timestamp: number;
  messageId: string | null;
}

const normalizeInboxReference = (value: InboxLastViewed): InboxLastViewed => ({
  timestamp: Number.isFinite(value.timestamp) ? Math.max(0, Math.floor(value.timestamp)) : 0,
  messageId: value.messageId && value.messageId.trim().length > 0 ? value.messageId.trim() : null,
});

const getMessageIdentifier = (message: { id?: string | null; clientId?: string | null }): string | null => {
  if (typeof message.id === "string" && message.id.trim().length > 0) {
    return message.id.trim();
  }
  if (typeof message.clientId === "string" && message.clientId.trim().length > 0) {
    return message.clientId.trim();
  }
  return null;
};

const isReferenceNewer = (next: InboxLastViewed, previous: InboxLastViewed): boolean => {
  if (next.timestamp > previous.timestamp) {
    return true;
  }
  if (next.timestamp < previous.timestamp) {
    return false;
  }
  if (!next.messageId) {
    return false;
  }
  if (!previous.messageId) {
    return true;
  }
  return next.messageId !== previous.messageId;
};

const isMessageAfterReference = (
  message: { createdAt: number; id?: string | null; clientId?: string | null },
  reference: InboxLastViewed,
): boolean => {
  if (message.createdAt > reference.timestamp) {
    return true;
  }
  if (message.createdAt < reference.timestamp) {
    return false;
  }
  const identifier = getMessageIdentifier(message);
  if (!identifier) {
    return false;
  }
  if (!reference.messageId) {
    return true;
  }
  return identifier !== reference.messageId;
};

const computeLatestInboxReference = (
  conversations: Record<string, DirectMessageConversation>,
): InboxLastViewed => {
  let latest: InboxLastViewed = { timestamp: 0, messageId: null };
  Object.values(conversations).forEach((conversation) => {
    conversation.messages.forEach((message) => {
      const candidate: InboxLastViewed = {
        timestamp: message.createdAt,
        messageId: getMessageIdentifier(message),
      };
      if (isReferenceNewer(candidate, latest)) {
        latest = candidate;
      }
    });
  });
  return normalizeInboxReference(latest);
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const sortMessages = (messages: DirectMessageEntry[]) =>
  [...messages].sort((a, b) => a.createdAt - b.createdAt);

const ensureConversation = (
  conversations: Record<string, DirectMessageConversation>,
  pubkey: string,
): DirectMessageConversation =>
  conversations[pubkey] ?? {
    peerPubkey: pubkey,
    messages: [],
    unreadCount: 0,
    error: null,
  };

const usePortalNode = () => {
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    let portal = document.getElementById(PORTAL_ELEMENT_ID);
    if (!portal) {
      portal = document.createElement("div");
      portal.id = PORTAL_ELEMENT_ID;
      document.body.appendChild(portal);
    }
    setNode(portal);
    return () => {
      if (portal && portal.parentElement) {
        portal.parentElement.removeChild(portal);
      }
    };
  }, []);

  return node;
};

export const DirectMessageProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { nostrPrivKey, token, user, updateUser } = useAuth();
  const { ready: accountReady, pubkey: accountPubkey, signEvent, privkey } = useNostrAccount();
  const [conversations, setConversations] = useState<Record<string, DirectMessageConversation>>({});
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const poolRef = useRef<SimplePool | null>(null);
  const processedEventsRef = useRef<Set<string>>(new Set());
  const activeConversationRef = useRef<string | null>(null);
  const portalNode = usePortalNode();
  const [inboxLastViewed, setInboxLastViewed] = useState<InboxLastViewed>(() => {
    const timestamp =
      typeof user?.preferences?.directMessagesLastViewedAt === "number" &&
      Number.isFinite(user.preferences.directMessagesLastViewedAt)
        ? Math.max(0, Math.floor(user.preferences.directMessagesLastViewedAt))
        : 0;
    const messageId =
      typeof user?.preferences?.directMessagesLastViewedMessageId === "string" &&
      user.preferences.directMessagesLastViewedMessageId.trim().length > 0
        ? user.preferences.directMessagesLastViewedMessageId.trim()
        : null;
    return { timestamp, messageId };
  });
  const inboxLastViewedRef = useRef<InboxLastViewed>(inboxLastViewed);
  const conversationsRef = useRef<Record<string, DirectMessageConversation>>({});

  const privkeyHex = useMemo(() => {
    if (nostrPrivKey && nostrPrivKey.trim().length > 0) {
      return nostrPrivKey.trim();
    }
    if (privkey) {
      return bytesToHex(privkey);
    }
    return null;
  }, [nostrPrivKey, privkey]);

  useEffect(() => {
    inboxLastViewedRef.current = inboxLastViewed;
  }, [inboxLastViewed]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    const timestamp =
      typeof user?.preferences?.directMessagesLastViewedAt === "number" &&
      Number.isFinite(user.preferences.directMessagesLastViewedAt)
        ? Math.max(0, Math.floor(user.preferences.directMessagesLastViewedAt))
        : 0;
    const messageId =
      typeof user?.preferences?.directMessagesLastViewedMessageId === "string" &&
      user.preferences.directMessagesLastViewedMessageId.trim().length > 0
        ? user.preferences.directMessagesLastViewedMessageId.trim()
        : null;
    const normalized = normalizeInboxReference({ timestamp, messageId });
    setInboxLastViewed((prev) => {
      if (prev.timestamp === normalized.timestamp && prev.messageId === normalized.messageId) {
        return prev;
      }
      inboxLastViewedRef.current = normalized;
      return normalized;
    });
  }, [
    user?.id,
    user?.preferences?.directMessagesLastViewedAt,
    user?.preferences?.directMessagesLastViewedMessageId,
  ]);

  const ready = Boolean(accountReady && accountPubkey && signEvent && privkeyHex);

  useEffect(() => {
    if (!ready) {
      if (!accountReady) {
        setError("Loading Nostr keys. Direct messages will be available soon.");
      } else if (!signEvent || !accountPubkey) {
        setError("We couldn't access your Nostr signer. Refresh your keys and try again.");
      } else if (!privkeyHex) {
        setError("A local Nostr private key is required for encrypted chats.");
      } else {
        setError("Direct messages are unavailable right now.");
      }
    } else {
      setError(null);
    }
  }, [accountReady, accountPubkey, privkeyHex, ready, signEvent]);

  const persistInboxLastViewed = useCallback(
    async (next: InboxLastViewed) => {
      const normalized = normalizeInboxReference(next);
      const current = inboxLastViewedRef.current;
      if (
        current.timestamp === normalized.timestamp &&
        current.messageId === normalized.messageId
      ) {
        return;
      }

      if (!isReferenceNewer(normalized, current)) {
        return;
      }

      inboxLastViewedRef.current = normalized;
      setInboxLastViewed(normalized);

      updateUser((prev) => {
        if (!prev) return prev;
        const nextPreferences = {
          ...(prev.preferences ?? {}),
          directMessagesLastViewedAt: normalized.timestamp,
          directMessagesLastViewedMessageId: normalized.messageId,
        };
        return {
          ...prev,
          preferences: nextPreferences,
        };
      });

      if (!user || !token) {
        return;
      }

      const payload = {
        preferences: {
          ...(user.preferences ?? {}),
          directMessagesLastViewedAt: normalized.timestamp,
          directMessagesLastViewedMessageId: normalized.messageId,
        },
      };

      try {
        await strapiFetch(`/api/users/${user.id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
      } catch (persistError) {
        console.error("Failed to persist direct message view state", persistError);
      }
    },
    [token, updateUser, user],
  );

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    const pool = new SimplePool();
    poolRef.current = pool;
    return () => {
      pool.close(DM_RELAYS);
      poolRef.current = null;
    };
  }, []);

  const markAsRead = useCallback(
    (pubkey: string) => {
      setConversations((prev) => {
        const existing = prev[pubkey];
        if (!existing || existing.unreadCount === 0) {
          return prev;
        }
        return {
          ...prev,
          [pubkey]: { ...existing, unreadCount: 0 },
        };
      });

      const conversation = conversationsRef.current[pubkey];
      if (!conversation || conversation.messages.length === 0) {
        return;
      }
      const latestMessage = conversation.messages[conversation.messages.length - 1];
      const reference = normalizeInboxReference({
        timestamp: latestMessage.createdAt,
        messageId: getMessageIdentifier(latestMessage),
      });
      if (isReferenceNewer(reference, inboxLastViewedRef.current)) {
        void persistInboxLastViewed(reference);
      }
    },
    [persistInboxLastViewed],
  );

  useEffect(() => {
    if (activeConversation) {
      markAsRead(activeConversation);
    }
  }, [activeConversation, markAsRead]);

  const markInboxAsViewed = useCallback(() => {
    const latestReference = computeLatestInboxReference(conversationsRef.current);
    setConversations((prev) => {
      let mutated = false;
      const nextEntries: [string, DirectMessageConversation][] = [];
      Object.entries(prev).forEach(([key, conversation]) => {
        if (conversation.unreadCount > 0) {
          mutated = true;
          nextEntries.push([key, { ...conversation, unreadCount: 0 }]);
        } else {
          nextEntries.push([key, conversation]);
        }
      });
      if (!mutated) {
        return prev;
      }
      return Object.fromEntries(nextEntries);
    });
    void persistInboxLastViewed(latestReference);
  }, [persistInboxLastViewed]);

  const encryptWithPeer = useCallback(
    async (peerPubkey: string, plaintext: string) => {
      if (!privkeyHex) {
        throw new Error("A stored Nostr private key is required to send encrypted messages.");
      }
      return encryptDirectMessage(privkeyHex, peerPubkey, plaintext);
    },
    [privkeyHex],
  );

  const decryptWithPeer = useCallback(
    async (peerPubkey: string, payload: string) => {
      if (!privkeyHex) {
        throw new Error("A stored Nostr private key is required to read encrypted messages.");
      }
      return decryptDirectMessage(privkeyHex, peerPubkey, payload);
    },
    [privkeyHex],
  );

  const handleIncomingEvent = useCallback(
    (event: Event) => {
      if (!accountPubkey) {
        return;
      }
      if (processedEventsRef.current.has(event.id)) {
        return;
      }
      processedEventsRef.current.add(event.id);
      const peerTag = event.tags.find((tag) => tag[0] === "p" && typeof tag[1] === "string");
      const peerPubkey = event.pubkey === accountPubkey ? (peerTag?.[1] as string | undefined) : event.pubkey;
      if (!peerPubkey) {
        return;
      }
      (async () => {
        let plaintext = "";
        let errorMessage: string | null = null;
        try {
          plaintext = await decryptWithPeer(peerPubkey, event.content);
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : String(error);
          plaintext = "[Unable to decrypt message]";
          if (import.meta.env?.DEV) {
            console.warn("Failed to decrypt direct message", error);
          }
        }
        const replyTags = event.tags.filter((tag) => tag[0] === "e" && typeof tag[1] === "string");
        const replyTag = replyTags.find((tag) => tag[3] === "reply") ?? replyTags[0];
        const replyToId = replyTag ? (replyTag[1] as string) : null;
        const direction = event.pubkey === accountPubkey ? "outgoing" : "incoming";
        let inboxReferenceUpdate: InboxLastViewed | null = null;
        setConversations((prev) => {
          const existing = ensureConversation(prev, peerPubkey);
          if (existing.messages.some((message) => message.id === event.id)) {
            const updatedMessages = existing.messages.map((message) =>
              message.id === event.id
                ? {
                    ...message,
                    plaintext: plaintext || message.plaintext,
                    status: event.pubkey === accountPubkey ? "sent" : "received",
                    error: errorMessage,
                    replyToId: message.replyToId ?? replyToId,
                    language: message.language ?? extractLanguageTag(event.tags),
                  }
                : message,
            );
            return {
              ...prev,
              [peerPubkey]: {
                ...existing,
                messages: sortMessages(updatedMessages),
                unreadCount: existing.unreadCount,
              },
            };
          }
        const message: DirectMessageEntry = {
          id: event.id,
          createdAt: event.created_at,
          plaintext,
          language: extractLanguageTag(event.tags),
          direction,
          status: direction === "outgoing" ? "sent" : "received",
          error: errorMessage,
          replyToId,
        };
          const isActiveConversation = activeConversationRef.current === peerPubkey;
          if (direction === "incoming" && isActiveConversation) {
            inboxReferenceUpdate = normalizeInboxReference({
              timestamp: message.createdAt,
              messageId: message.id,
            });
          }
          const shouldCountAsUnread =
            direction === "incoming" &&
            !isActiveConversation &&
            isMessageAfterReference(message, inboxLastViewedRef.current);
          const unread = shouldCountAsUnread ? existing.unreadCount + 1 : existing.unreadCount;
          return {
            ...prev,
            [peerPubkey]: {
              ...existing,
              messages: sortMessages([...existing.messages, message]),
              unreadCount: unread,
            },
          };
        });
        if (inboxReferenceUpdate) {
          void persistInboxLastViewed(inboxReferenceUpdate);
        }
      })().catch(() => undefined);
    },
    [accountPubkey, decryptWithPeer, persistInboxLastViewed],
  );

  useEffect(() => {
    if (!ready || !accountPubkey) {
      return;
    }
    const pool = poolRef.current;
    if (!pool) {
      return;
    }
    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 14;
    const filters = [
      { kinds: [4], "#p": [accountPubkey], since },
      { kinds: [4], authors: [accountPubkey], since },
    ];
    const subscription = pool.subscribeMany(DM_RELAYS, filters, {
      onevent: handleIncomingEvent,
      onerror: (relayError) => {
        if (import.meta.env?.DEV) {
          console.warn("Direct message relay error", relayError);
        }
      },
    });
    return () => {
      subscription.close();
    };
  }, [accountPubkey, handleIncomingEvent, ready]);

  const openConversation = useCallback((pubkey: string) => {
    if (!pubkey) return;
    setConversations((prev) => {
      const existing = ensureConversation(prev, pubkey);
      return {
        ...prev,
        [pubkey]: { ...existing, unreadCount: 0 },
      };
    });
    setActiveConversation(pubkey);
  }, []);

  const closeConversation = useCallback(() => {
    setActiveConversation(null);
  }, []);

  const getDraft = useCallback((pubkey: string) => drafts[pubkey] ?? "", [drafts]);

  const setDraft = useCallback((pubkey: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [pubkey]: value }));
  }, []);

  const hasUnreadMessages = useMemo(() => {
    return Object.values(conversations).some((conversation) =>
      conversation.messages.some(
        (message) =>
          message.direction === "incoming" &&
          isMessageAfterReference(message, inboxLastViewed),
      ),
    );
  }, [conversations, inboxLastViewed]);

  const sendMessage = useCallback(
    async (pubkey: string, body: string, options?: { replyToId?: string | null }) => {
      if (!ready || !accountPubkey || !signEvent) {
        throw new Error("Your Nostr account isn't ready yet. Try again once keys are available.");
      }
      const trimmed = body.trim();
      if (!trimmed) {
        return;
      }
      const clientId = `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const createdAt = Math.floor(Date.now() / 1000);
      const normalizedReplyToId =
        options?.replyToId && options.replyToId.trim().length > 0
          ? options.replyToId.trim()
          : null;
      setConversations((prev) => {
        const existing = ensureConversation(prev, pubkey);
        const message: DirectMessageEntry = {
          id: clientId,
          clientId,
          createdAt,
          plaintext: trimmed,
          language: DEFAULT_LANGUAGE_TAG,
          direction: "outgoing",
          status: "pending",
          replyToId: normalizedReplyToId,
        };
        return {
          ...prev,
          [pubkey]: {
            ...existing,
            error: null,
            messages: sortMessages([...existing.messages.filter((entry) => entry.clientId !== clientId), message]),
            unreadCount: existing.unreadCount,
          },
        };
      });
      setDraft(pubkey, "");
      try {
        const content = await encryptWithPeer(pubkey, trimmed);
        const tags: string[][] = [["p", pubkey]];
        if (DEFAULT_LANGUAGE_TAG) {
          tags.push(["lang", DEFAULT_LANGUAGE_TAG]);
        }
        if (normalizedReplyToId) {
          tags.push(["e", normalizedReplyToId, "", "reply"]);
        }

        const template: EventTemplate = {
          kind: 4,
          created_at: createdAt,
          content,
          tags,
        };
        const signed = await signEvent(template);
        setConversations((prev) => {
          const existing = ensureConversation(prev, pubkey);
          const updated = existing.messages.map((entry) =>
            entry.clientId === clientId || entry.id === clientId
              ? { ...entry, id: signed.id, createdAt: signed.created_at, status: "pending" }
              : entry,
          );
          return {
            ...prev,
            [pubkey]: {
              ...existing,
              messages: sortMessages(updated),
            },
          };
        });
        const pool = poolRef.current;
        if (!pool) {
          throw new Error("Direct message relay is not connected.");
        }
        await publishWithPool(pool, DM_RELAYS, signed);
        processedEventsRef.current.add(signed.id);
        setConversations((prev) => {
          const existing = ensureConversation(prev, pubkey);
          const updated = existing.messages.map((entry) =>
            entry.id === signed.id || entry.clientId === clientId
              ? { ...entry, status: "sent", error: null }
              : entry,
          );
          return {
            ...prev,
            [pubkey]: {
              ...existing,
              messages: sortMessages(updated),
            },
          };
        });
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : String(sendError);
        setConversations((prev) => {
          const existing = ensureConversation(prev, pubkey);
          const updated = existing.messages.map((entry) =>
            entry.clientId === clientId || entry.id === clientId
              ? { ...entry, status: "failed", error: message }
              : entry,
          );
          return {
            ...prev,
            [pubkey]: {
              ...existing,
              messages: updated,
              error: message,
            },
          };
        });
        throw sendError;
      }
    },
    [accountPubkey, encryptWithPeer, ready, setDraft, signEvent],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ pubkey?: string | null }>).detail;
      const pubkey = detail?.pubkey;
      if (typeof pubkey === "string" && pubkey.trim().length > 0) {
        openConversation(pubkey.trim());
      }
    };
    window.addEventListener("bitcoinsquare:open-dm", handleOpen as EventListener);
    window.addEventListener("nostr:dm", handleOpen as EventListener);
    return () => {
      window.removeEventListener("bitcoinsquare:open-dm", handleOpen as EventListener);
      window.removeEventListener("nostr:dm", handleOpen as EventListener);
    };
  }, [openConversation]);

  const contextValue = useMemo<DirectMessageContextValue>(
    () => ({
      activeConversation,
      conversations,
      inboxLastViewed,
      hasUnreadMessages,
      ready,
      error,
      openConversation,
      closeConversation,
      sendMessage,
      markAsRead,
      markInboxAsViewed,
      getDraft,
      setDraft,
    }),
    [
      activeConversation,
      closeConversation,
      conversations,
      hasUnreadMessages,
      inboxLastViewed,
      error,
      getDraft,
      markAsRead,
      markInboxAsViewed,
      openConversation,
      ready,
      sendMessage,
      setDraft,
    ],
  );

  return (
    <DirectMessageContext.Provider value={contextValue}>
      {children}
      {portalNode && createPortal(<DirectMessageOverlay />, portalNode)}
    </DirectMessageContext.Provider>
  );
};

export const useDirectMessages = () => {
  const context = useContext(DirectMessageContext);
  if (!context) {
    throw new Error("useDirectMessages must be used within a DirectMessageProvider");
  }
  return context;
};

const DirectMessageOverlay: React.FC = () => {
  const {
    activeConversation,
    conversations,
    closeConversation,
    sendMessage,
    ready,
    error,
    getDraft,
    setDraft,
  } = useDirectMessages();
  const { resolveProfileSummary, shortenPubkey } = useProfileIdentity();
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const conversation = activeConversation ? conversations[activeConversation] : undefined;
  const draft = activeConversation ? getDraft(activeConversation) : "";
  const summary = activeConversation ? resolveProfileSummary(activeConversation) : null;
  const disableOverlay =
    typeof window !== "undefined" &&
    (window.location.pathname.includes("/messages") ||
      isCommunityMessagesLocation(window.location.pathname, window.location.search));

  useEffect(() => {
    if (disableOverlay) return;
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [conversation?.messages.length, activeConversation, disableOverlay]);

  useEffect(() => {
    setComposerFocused(false);
  }, [activeConversation]);

  if (disableOverlay || !activeConversation || !conversation || !summary) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) {
      return;
    }
    setComposerError(null);
    setSending(true);
    try {
      await sendMessage(activeConversation, draft);
    } catch (sendErr) {
      const message = sendErr instanceof Error ? sendErr.message : String(sendErr);
      setComposerError(message);
    } finally {
      setSending(false);
    }
  };

  const formatTimestamp = (seconds: number) => {
    if (!Number.isFinite(seconds)) {
      return "";
    }
    const date = new Date(seconds * 1000);
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      }).format(date);
    } catch {
      return date.toLocaleString();
    }
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-end justify-end p-4">
      <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src={summary.avatarUrl}
              alt={summary.displayName}
              className="h-10 w-10 rounded-full border border-[var(--border-subtle)] object-cover"
            />
            <div>
              <h2 className="text-sm font-semibold text-[var(--fg-default)]">{summary.displayName}</h2>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                {shortenPubkey(activeConversation)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeConversation}
            className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
          >
            Close
          </button>
        </header>

        <div className="flex h-96 flex-col bg-[var(--bg-surface)]/60">
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {conversation.messages.length === 0 ? (
              <p className="mt-8 text-center text-xs uppercase tracking-[0.2em] text-[var(--fg-muted)]">
                No messages yet. Say hello!
              </p>
            ) : (
              conversation.messages.map((message) => (
                <div
                  key={message.id || message.clientId}
                  className={`flex ${message.direction === "outgoing" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-md ${
                      message.direction === "outgoing"
                        ? "bg-brand/90 text-white"
                        : "border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--fg-default)]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{message.plaintext}</p>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.2em] text-[var(--fg-muted)]">
                      <span className="opacity-80">
                        {formatTimestamp(message.createdAt)}
                      </span>
                      {message.direction === "outgoing" && (
                        <span className="opacity-80">
                          {message.status === "pending"
                            ? "Sending…"
                            : message.status === "failed"
                              ? "Failed"
                              : "Sent"}
                        </span>
                      )}
                    </div>
                    {message.error && (
                      <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-red-500">
                        {message.error}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-[var(--border-subtle)] bg-[var(--bg-card)]/80 px-4 py-3"
          >
            {!ready && (
              <p className="mb-2 text-xs text-[var(--fg-muted)]">
                {error ?? "Direct messages are initializing. Please wait."}
              </p>
            )}
            {composerError && (
              <p className="mb-2 text-xs text-red-500">{composerError}</p>
            )}
            <div className="flex items-end gap-3">
              <textarea
                value={draft}
                onChange={(event) => setDraft(activeConversation, event.target.value)}
                placeholder="Write a message…"
                onFocus={() => setComposerFocused(true)}
                onBlur={() => {
                  if (draft.trim().length === 0) {
                    setComposerFocused(false);
                  }
                }}
                className="max-h-32 flex-1 resize-none rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 px-3 py-2 text-sm leading-relaxed text-[var(--fg-default)] outline-none focus:border-brand"
                disabled={!ready || sending}
                rows={composerFocused || draft.trim().length > 0 ? 3 : 1}
              />
              <button
                type="submit"
                disabled={!ready || sending || !draft.trim()}
                className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-brand/40"
              >
                {sending ? "Sending" : "Send"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DirectMessageProvider;
