import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SimplePool,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  type Event,
  type EventTemplate,
} from "nostr-tools";

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://eden.nostr.land",
];

const FOOTER_TEXT =
  "🟧 This is a note from the public chat room on BitcoinSquare.io — come join our private community for great Bitcoin-related tools and discussions.";

const ROOM_TAG = "room:bitcoinsquare-public";
const STORAGE_KEY = "bitcoin-square-public-chat-secret";
const MAX_MESSAGES = 400;

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const fromHex = (hex: string) => {
  const normalized = hex.trim().replace(/^0x/i, "");
  if (normalized.length % 2 !== 0) {
    throw new Error("Secret key hex is malformed");
  }
  const result = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    result[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
  }
  return result;
};

const ensureSecretKey = (): Uint8Array | null => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return fromHex(stored);
    }
    const generated = generateSecretKey();
    window.localStorage.setItem(STORAGE_KEY, toHex(generated));
    return generated;
  } catch (error) {
    console.warn("Unable to access secret key storage", error);
    return generateSecretKey();
  }
};

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

const mapEventToMessage = (event: Event): PublicChatMessage => ({
  id: event.id,
  pubkey: event.pubkey,
  created_at: event.created_at,
  rawContent: event.content,
  body: extractBody(event.content),
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
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [poolReady, setPoolReady] = useState(false);
  const poolRef = useRef<SimplePool | null>(null);

  const ready = useMemo(
    () => secretKey !== null && poolReady,
    [secretKey, poolReady],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = ensureSecretKey();
    if (!key) return;
    setSecretKey(key);
    try {
      setPubkey(getPublicKey(key));
    } catch (error) {
      console.warn("Failed to derive pubkey", error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pool = new SimplePool();
    poolRef.current = pool;
    setPoolReady(true);

    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24;
    const subscription = pool.subscribeMany(
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
          if (!event.tags.some((tag) => tag[0] === "t" && tag[1] === ROOM_TAG)) {
            return;
          }
          setMessages((prev) => upsertMessage(prev, mapEventToMessage(event)));
        },
        onerror: (err) => {
          console.warn("Relay subscription error", err);
        },
      },
    );

    return () => {
      subscription.close();
      pool.close(RELAYS);
      poolRef.current = null;
      setPoolReady(false);
    };
  }, []);

  const sendMessage = useCallback(
    async (message: string): Promise<PublishResult> => {
      if (!message.trim()) {
        throw new Error("Message cannot be empty");
      }
      if (!secretKey) {
        throw new Error("Chat is not ready yet");
      }
      const pool = poolRef.current;
      if (!pool) {
        throw new Error("Relay pool is not initialized");
      }

      const now = Math.floor(Date.now() / 1000);
      const content = `${message.trim()}\n\n${FOOTER_TEXT}`;

      const template: EventTemplate = {
        kind: 1,
        created_at: now,
        tags: [
          ["t", ROOM_TAG],
          ["client", "BitcoinSquarePublicChat"],
        ],
        content,
      };

      const event = finalizeEvent(template, secretKey);

      setMessages((prev) =>
        upsertMessage(prev, {
          id: event.id,
          pubkey: event.pubkey,
          created_at: event.created_at,
          rawContent: event.content,
          body: message.trim(),
          status: "pending",
          optimistic: true,
          retryPayload: message.trim(),
        }),
      );

      try {
        const publication = pool.publish(RELAYS, event);

        publication.on("ok", () => {
          setMessages((prev) =>
            upsertMessage(prev, {
              id: event.id,
              pubkey: event.pubkey,
              created_at: event.created_at,
              rawContent: event.content,
              body: message.trim(),
              status: "ok",
              optimistic: false,
              retryPayload: undefined,
            }),
          );
        });

        publication.on("failed", (reason: string) => {
          console.warn("Publish failed", reason);
          setMessages((prev) => updateMessageStatus(prev, event.id, "failed"));
        });

        return { eventId: event.id };
      } catch (error) {
        setMessages((prev) => updateMessageStatus(prev, event.id, "failed"));
        throw error;
      }
    },
    [secretKey],
  );

  return {
    messages,
    sendMessage,
    ready,
    pubkey,
  } as const;
};
