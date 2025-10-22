import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SimplePool, type Event, type EventTemplate } from "../lib/nostrToolsShim";

import { useNostrAccount } from "./useNostrAccount";
import { publishWithPool } from "../lib/nostrPublish";
import { encryptChannelText, decryptChannelText } from "../utils/channelEncryption";
import { useRoomKey } from "./useRoomKey";
import { getConfiguredRoomKey } from "../config/nostr";
import { getBrowserLanguageTag } from "../utils/browserLanguage";

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
];

const FOOTER_TEXT =
  "🟧 This is a note from the public chat room on BitcoinSquare.io — come join our private community for great Bitcoin-related tools and discussions.";

const ROOM_ID = "bitcoinsquare-public";
const ROOM_TAG = `room:${ROOM_ID}`;
const MAX_MESSAGES = 400;
const ENCRYPTED_PLACEHOLDER = "Encrypted message (unlock to view)";
const DECRYPT_FAILURE_PLACEHOLDER = "Unable to decrypt message";
const BROWSER_LANGUAGE_TAG = getBrowserLanguageTag();

const extractBody = (content: string) => {
  if (!content) return "";
  if (!content.includes(FOOTER_TEXT)) {
    return content;
  }
  const idx = content.lastIndexOf(FOOTER_TEXT);
  if (idx === -1) return content;
  return content.slice(0, idx).trimEnd();
};

export interface PublicChatMessage {
  id: string;
  pubkey: string;
  created_at: number;
  rawContent: string;
  body: string;
  status: "pending" | "ok" | "failed";
  optimistic: boolean;
  retryPayload?: string;
}

interface PublishResult {
  eventId: string;
}

const mapEventToMessage = (event: Event, plaintext: string): PublicChatMessage => ({
  id: event.id,
  pubkey: event.pubkey,
  created_at: event.created_at,
  rawContent: event.content,
  body: extractBody(plaintext),
  status: "ok",
  optimistic: false,
  retryPayload: undefined,
});

const upsertMessage = (
  messages: PublicChatMessage[],
  incoming: PublicChatMessage,
) => {
  const index = messages.findIndex((item) => item.id === incoming.id);
  if (index >= 0) {
    const copy = [...messages];
    copy[index] = {
      ...copy[index],
      ...incoming,
      status: incoming.status ?? copy[index].status,
      optimistic: incoming.optimistic,
    };
    return copy.sort((a, b) => a.created_at - b.created_at).slice(-MAX_MESSAGES);
  }
  return [...messages, incoming]
    .sort((a, b) => a.created_at - b.created_at)
    .slice(-MAX_MESSAGES);
};

const updateMessageStatus = (
  messages: PublicChatMessage[],
  eventId: string,
  status: PublicChatMessage["status"],
) =>
  messages.map((message) =>
    message.id === eventId
      ? {
          ...message,
          status,
          optimistic: status === "ok" ? false : message.optimistic,
        }
      : message,
  );

export const useBitcoinSquarePublicChat = () => {
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [poolReady, setPoolReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poolRef = useRef<SimplePool | null>(null);
  const eventsRef = useRef<Map<string, Event>>(new Map());
  const { ready: accountReady, pubkey, signEvent } = useNostrAccount();
  const configuredRoomKey = getConfiguredRoomKey(ROOM_ID);
  const {
    hasKey: roomKeyAvailable,
    ensure: ensureRoomKey,
    loading: roomKeyLoading,
    error: roomKeyError,
  } = useRoomKey({ roomId: ROOM_ID, isPrivate: true, seedBase64: configuredRoomKey });

  const ready = useMemo(
    () => accountReady && poolReady && roomKeyAvailable && !roomKeyLoading,
    [accountReady, poolReady, roomKeyAvailable, roomKeyLoading],
  );

  useEffect(() => {
    if (roomKeyError) {
      setError(roomKeyError);
    } else if (roomKeyAvailable) {
      setError(null);
    }
  }, [roomKeyAvailable, roomKeyError]);

  const decodeEvent = useCallback(
    async (event: Event): Promise<{ body: string; error: string | null }> => {
      const encryptedPayload = typeof event.content === "string" && event.content.startsWith("v44:");

      if (!encryptedPayload) {
        return { body: event.content, error: null };
      }

      if (!roomKeyAvailable) {
        return { body: ENCRYPTED_PLACEHOLDER, error: null };
      }

      try {
        const plaintext = await decryptChannelText(ROOM_ID, event.content);
        return { body: plaintext, error: null };
      } catch (decryptError) {
        console.warn("Failed to decrypt public chat message", decryptError);
        const message =
          decryptError instanceof Error
            ? decryptError.message
            : "Unable to decrypt public chat message";
        return { body: DECRYPT_FAILURE_PLACEHOLDER, error: message };
      }
    },
    [roomKeyAvailable],
  );

  const processEvent = useCallback(
    async (event: Event) => {
      if (!event.tags.some((tag) => tag[0] === "t" && tag[1] === ROOM_TAG)) {
        return;
      }

      eventsRef.current.set(event.id, event);

      const { body, error: decodeError } = await decodeEvent(event);
      setMessages((prev) => upsertMessage(prev, mapEventToMessage(event, body)));

      if (decodeError) {
        setError(decodeError);
      } else {
        setError(null);
      }
    },
    [decodeEvent],
  );

  useEffect(() => {
    if (!roomKeyAvailable) return;
    const encryptedEvents = Array.from(eventsRef.current.values()).filter((event) =>
      typeof event.content === "string" ? event.content.startsWith("v44:") : false,
    );
    if (encryptedEvents.length === 0) {
      return;
    }

    let cancelled = false;

    const upgrade = async () => {
      const decoded = await Promise.all(
        encryptedEvents.map(async (event) => ({ event, result: await decodeEvent(event) })),
      );

      if (cancelled) return;

      setMessages((prev) =>
        decoded.reduce(
          (acc, entry) => upsertMessage(acc, mapEventToMessage(entry.event, entry.result.body)),
          prev,
        ),
      );

      const errors = decoded
        .map((entry) => entry.result.error)
        .filter((value): value is string => Boolean(value));

      if (errors.length > 0) {
        setError(errors[errors.length - 1] ?? null);
      } else {
        setError(null);
      }
    };

    void upgrade();

    return () => {
      cancelled = true;
    };
  }, [decodeEvent, roomKeyAvailable]);

  useEffect(() => {
    if (roomKeyAvailable || roomKeyLoading) return;
    ensureRoomKey().catch((ensureError) => {
      console.warn("Failed to initialise public chat room key", ensureError);
      setError(
        ensureError instanceof Error ? ensureError.message : "Unable to initialise encryption key",
      );
    });
  }, [ensureRoomKey, roomKeyAvailable, roomKeyLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pool = new SimplePool();
    poolRef.current = pool;
    let cancelled = false;
    let subscription: ReturnType<SimplePool["subscribeMany"]> | null = null;

    pool
      .waitUntilReady()
      .then(() => {
        if (cancelled) return;
        setPoolReady(true);

        const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24;
        subscription = pool.subscribeMany(
          RELAYS,
          [
            {
              kinds: [1],
              "#t": [ROOM_TAG],
              since,
              limit: 200,
            },
          ],
          {
            onevent: (event) => {
              void processEvent(event);
            },
            onerror: (err) => {
              console.warn("Relay subscription error", err);
            },
          },
        );
      })
      .catch((loadError) => {
        if (cancelled) return;
        console.warn("Failed to initialise public chat pool", loadError);
      });

    return () => {
      cancelled = true;
      subscription?.close();
      pool.close(RELAYS);
      poolRef.current = null;
      setPoolReady(false);
      eventsRef.current.clear();
    };
  }, [processEvent]);

  const sendMessage = useCallback(
    async (message: string): Promise<PublishResult> => {
      if (!message.trim()) {
        throw new Error("Message cannot be empty");
      }
      if (!signEvent) {
        throw new Error("Your Nostr keys are not ready yet");
      }
      const pool = poolRef.current;
      if (!pool) {
        throw new Error("Relay pool is not initialized");
      }

      await ensureRoomKey();

      const now = Math.floor(Date.now() / 1000);
      const trimmed = message.trim();
      const plaintext = `${trimmed}\n\n${FOOTER_TEXT}`;
      const content = await encryptChannelText(ROOM_ID, plaintext);

      const template: EventTemplate = {
        kind: 1,
        created_at: now,
        tags: [
          ["t", ROOM_TAG],
          ["lang", BROWSER_LANGUAGE_TAG],
          ["client", "BitcoinSquarePublicChat"],
        ],
        content,
      };

      const event = await signEvent(template);
      eventsRef.current.set(event.id, event);

      setMessages((prev) =>
        upsertMessage(prev, {
          id: event.id,
          pubkey: event.pubkey,
          created_at: event.created_at,
          rawContent: event.content,
          body: trimmed,
          status: "pending",
          optimistic: true,
          retryPayload: trimmed,
        }),
      );

      try {
        await publishWithPool(pool, RELAYS, event);
        setMessages((prev) =>
          upsertMessage(prev, {
            id: event.id,
            pubkey: event.pubkey,
            created_at: event.created_at,
            rawContent: event.content,
            body: trimmed,
            status: "ok",
            optimistic: false,
            retryPayload: undefined,
          }),
        );
        return { eventId: event.id };
      } catch (error) {
        setMessages((prev) => updateMessageStatus(prev, event.id, "failed"));
        throw error;
      }
    },
    [ensureRoomKey, signEvent],
  );

  return {
    messages,
    sendMessage,
    ready,
    pubkey,
    error,
  } as const;
};
