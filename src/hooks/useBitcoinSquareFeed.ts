import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SimplePool, type Event, type EventTemplate, type Filter } from "../lib/nostrToolsShim";

import {
  cacheMessage,
  cacheMessages,
  getCachedMessages,
  type CachedMessage,
} from "../utils/chatCache";
import { useNostrAccount } from "./useNostrAccount";
import { publishWithPool, replicateWithPool } from "../lib/nostrPublish";
import { decryptChannelJson, encryptChannelJson } from "../utils/channelEncryption";
import { getConfiguredCasualRoomKey } from "../config/nostr";
import { useRoomKey } from "./useRoomKey";

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
];

const FAST_RELAY = RELAYS[0];
const FEED_ROOM_ID = "bitcoinsquare-feed";
const FEED_TAG = "bitcoinsquare-feed";
const MAX_POSTS = 500;
const INITIAL_FETCH_LIMIT = 50;
const LOAD_MORE_BATCH = 40;
const BASE_BACKOFF = 1000;
const MAX_BACKOFF = 30_000;
const RETRY_BASE_DELAY = 2000;
const MAX_PUBLISH_ATTEMPTS = 5;

export interface FeedAttachment {
  url: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
  dimensions?: string;
  digest?: string | null;
  iv?: string | null;
  eventId?: string | null;
}

export interface FeedPost {
  id: string;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
  attachments: FeedAttachment[];
  status: "pending" | "ok" | "failed";
  optimistic: boolean;
  error?: string;
  event: Event;
}

interface PublishResult {
  eventId: string;
}

export type PublishContext = {
  type: "reply" | "quote";
  post: FeedPost;
};

interface FeedPayload {
  body: string;
  attachments?: FeedAttachment[];
}

const normalizeAttachment = (attachment: Partial<FeedAttachment>): FeedAttachment | null => {
  if (!attachment || typeof attachment.url !== "string" || attachment.url.trim().length === 0) {
    return null;
  }
  const width = typeof attachment.width === "number" && Number.isFinite(attachment.width)
    ? attachment.width
    : undefined;
  const height = typeof attachment.height === "number" && Number.isFinite(attachment.height)
    ? attachment.height
    : undefined;
  const dimensions =
    typeof attachment.dimensions === "string" && attachment.dimensions.trim().length > 0
      ? attachment.dimensions.trim()
      : width && height
        ? `${width}x${height}`
        : undefined;
  return {
    url: attachment.url,
    mimeType:
      typeof attachment.mimeType === "string" && attachment.mimeType.trim().length > 0
        ? attachment.mimeType
        : "application/octet-stream",
    size:
      typeof attachment.size === "number" && Number.isFinite(attachment.size)
        ? attachment.size
        : undefined,
    width,
    height,
    dimensions,
    digest:
      typeof attachment.digest === "string" && attachment.digest.trim().length > 0
        ? attachment.digest.trim()
        : null,
    iv:
      typeof attachment.iv === "string" && attachment.iv.trim().length > 0
        ? attachment.iv.trim()
        : null,
    eventId:
      typeof attachment.eventId === "string" && attachment.eventId.trim().length > 0
        ? attachment.eventId.trim()
        : null,
  };
};

const parseAttachments = (tags: string[][]): FeedAttachment[] => {
  const attachments: FeedAttachment[] = [];
  let current: FeedAttachment | null = null;

  for (const tag of tags) {
    if (tag.length === 0) continue;
    const [key, value] = tag;
    if (key === "url") {
      if (current) {
        attachments.push(current);
      }
      current = {
        url: value,
        mimeType: "application/octet-stream",
      };
    } else if (!current) {
      continue;
    } else if (key === "m") {
      current.mimeType = value;
    } else if (key === "dim") {
      current.dimensions = value;
      const [w, h] = value.split("x");
      const width = Number.parseInt(w ?? "", 10);
      const height = Number.parseInt(h ?? "", 10);
      if (!Number.isNaN(width)) {
        current.width = width;
      }
      if (!Number.isNaN(height)) {
        current.height = height;
      }
    } else if (key === "size") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        current.size = parsed;
      }
    } else if (key === "iv") {
      current.iv = value;
    } else if (key === "x") {
      current.digest = value;
    }
  }

  if (current) {
    attachments.push(current);
  }

  return attachments;
};

const eventToCached = (event: Event, payload?: FeedPayload): CachedMessage => ({
  id: event.id,
  roomId: FEED_ROOM_ID,
  pubkey: event.pubkey,
  content: event.content,
  decrypted: payload ? JSON.stringify(payload) : undefined,
  created_at: event.created_at,
  kind: event.kind,
  tags: event.tags,
  sig: event.sig,
});

const cachedToEvent = (cached: CachedMessage): Event => ({
  id: cached.id,
  pubkey: cached.pubkey,
  created_at: cached.created_at,
  kind: cached.kind ?? 1,
  tags: cached.tags ?? [],
  content: cached.content,
  sig: cached.sig ?? "",
});

const extractAttachments = (payload: FeedPayload | string | undefined, tags: string[][]): FeedAttachment[] => {
  if (payload && typeof payload !== "string" && Array.isArray(payload.attachments)) {
    const normalized = payload.attachments
      .map((attachment) => normalizeAttachment(attachment))
      .filter((attachment): attachment is FeedAttachment => Boolean(attachment));
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return parseAttachments(tags);
};

const mapEventToPost = (
  event: Event,
  optimistic = false,
  decrypted?: FeedPayload | string,
): FeedPost => {
  const payload: FeedPayload =
    decrypted && typeof decrypted !== "string"
      ? decrypted
      : { body: typeof decrypted === "string" ? decrypted : event.content };
  const attachments = extractAttachments(payload, event.tags ?? []);
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    content: payload.body,
    tags: event.tags ?? [],
    attachments,
    status: optimistic ? "pending" : "ok",
    optimistic,
    error: undefined,
    event,
  };
};

const upsertPost = (posts: FeedPost[], incoming: FeedPost): FeedPost[] => {
  const existingIndex = posts.findIndex((post) => post.id === incoming.id);
  if (existingIndex >= 0) {
    const next = [...posts];
    const previous = next[existingIndex];
    next[existingIndex] = {
      ...previous,
      ...incoming,
      status: incoming.status ?? previous.status,
      optimistic: incoming.optimistic,
      error: incoming.error ?? previous.error,
      attachments: incoming.attachments.length > 0 ? incoming.attachments : previous.attachments,
      event: incoming.event ?? previous.event,
    };
    return next.sort((a, b) => b.created_at - a.created_at).slice(0, MAX_POSTS);
  }
  return [...posts, incoming]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, MAX_POSTS);
};

const updatePostStatus = (
  posts: FeedPost[],
  id: string,
  status: FeedPost["status"],
  error?: string,
) =>
  posts.map((post) =>
    post.id === id
      ? {
          ...post,
          status,
          optimistic: status === "ok" ? false : post.optimistic,
          error,
        }
      : post,
  );

const hasFeedTag = (event: Event) =>
  event.tags?.some((tag) => tag[0] === "t" && tag[1] === FEED_TAG) ?? false;

const listFromRelays = async (
  pool: SimplePool,
  relays: string[],
  filters: Filter[],
) =>
  new Promise<Event[]>((resolve) => {
    if (relays.length === 0) {
      resolve([]);
      return;
    }

    const events = new Map<string, Event>();
    const pending = new Set(relays);
    let finished = false;
    let subscription: ReturnType<SimplePool["subscribeMany"]> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      subscription?.close();
      resolve(Array.from(events.values()).sort((a, b) => b.created_at - a.created_at));
    };

    subscription = pool.subscribeMany(relays, filters, {
      onevent: (event: Event) => {
        events.set(event.id, event);
      },
      oneose: (relay?: string) => {
        if (relay) {
          pending.delete(relay);
        }
        if (pending.size === 0) {
          finish();
        }
      },
      onerror: (_error, relay) => {
        if (relay) {
          pending.delete(relay);
        }
        if (pending.size === 0) {
          finish();
        }
      },
    });

    timeout = setTimeout(() => {
      finish();
    }, 8000);
  });

export interface UseBitcoinSquareFeedReturn {
  posts: FeedPost[];
  ready: boolean;
  publishing: boolean;
  publishStatus: (content: string, context?: PublishContext | null) => Promise<PublishResult>;
  likePost: (post: FeedPost) => Promise<void>;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  pubkey: string | null;
  initialLoading: boolean;
}

export const useBitcoinSquareFeed = (): UseBitcoinSquareFeedReturn => {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [poolReady, setPoolReady] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);

  const poolRef = useRef<SimplePool | null>(null);
  const subRef = useRef<ReturnType<SimplePool["subscribeMany"]> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(BASE_BACKOFF);
  const oldestTimestampRef = useRef<number | null>(null);
  const initialLoadRef = useRef(false);
  const retryTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const { ready: accountReady, pubkey, signEvent } = useNostrAccount();
  const envRoomKey = getConfiguredCasualRoomKey();
  const {
    hasKey: feedKeyAvailable,
    loading: feedKeyLoading,
    error: feedKeyError,
    ensure: ensureFeedKey,
  } = useRoomKey({ roomId: FEED_ROOM_ID, isPrivate: true, seedBase64: envRoomKey });

  const ready = useMemo(() => accountReady && poolReady && feedKeyAvailable, [accountReady, feedKeyAvailable, poolReady]);

  const ensureOldestTimestamp = useCallback((nextPosts: FeedPost[]) => {
    if (nextPosts.length === 0) {
      oldestTimestampRef.current = null;
    } else {
      oldestTimestampRef.current = nextPosts[nextPosts.length - 1]?.created_at ?? null;
    }
  }, []);

  const insertPost = useCallback(
    (post: FeedPost) => {
      setPosts((prev) => {
        const next = upsertPost(prev, post);
        ensureOldestTimestamp(next);
        return next;
      });
    },
    [ensureOldestTimestamp],
  );

  const hydrateFromCache = useCallback(async () => {
    try {
      const cached = await getCachedMessages(FEED_ROOM_ID, INITIAL_FETCH_LIMIT);
      if (cached.length === 0) {
        setHasMore(true);
        setInitialLoading(true);
        return;
      }
      const mapped = cached
        .map((entry) => {
          let payload: FeedPayload | string = entry.content;
          if (entry.decrypted) {
            try {
              const parsed = JSON.parse(entry.decrypted) as FeedPayload;
              if (parsed && typeof parsed.body === "string") {
                payload = {
                  body: parsed.body,
                  attachments: Array.isArray(parsed.attachments)
                    ? parsed.attachments.map((attachment) => normalizeAttachment(attachment)).filter(
                        (attachment): attachment is FeedAttachment => Boolean(attachment),
                      )
                    : parseAttachments(entry.tags ?? []),
                };
              } else {
                payload = entry.decrypted;
              }
            } catch {
              payload = entry.decrypted;
            }
          }
          return mapEventToPost(cachedToEvent(entry), false, payload);
        })
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, MAX_POSTS);
      setPosts(mapped);
      ensureOldestTimestamp(mapped);
      setHasMore(cached.length >= INITIAL_FETCH_LIMIT);
      setInitialLoading(false);
    } catch (cacheError) {
      console.warn("Failed to hydrate feed cache", cacheError);
    }
  }, [ensureOldestTimestamp]);

  useEffect(() => {
    void hydrateFromCache();
  }, [hydrateFromCache]);

  const decodeEventContent = useCallback(
    async (event: Event): Promise<FeedPayload> => {
      const fallback = { body: event.content, attachments: parseAttachments(event.tags ?? []) };
      if (!feedKeyAvailable) {
        return fallback;
      }
      try {
        const payload = await decryptChannelJson<FeedPayload>(FEED_ROOM_ID, event.content);
        if (payload && typeof payload.body === "string") {
          const attachments = Array.isArray(payload.attachments)
            ? payload.attachments
                .map((attachment) => normalizeAttachment(attachment))
                .filter((attachment): attachment is FeedAttachment => Boolean(attachment))
            : parseAttachments(event.tags ?? []);
          return {
            body: payload.body,
            attachments,
          };
        }
        if (typeof (payload as unknown) === "string") {
          return { body: payload as unknown as string, attachments: parseAttachments(event.tags ?? []) };
        }
      } catch (decodeError) {
        console.warn("Failed to decrypt feed event", decodeError);
      }
      return fallback;
    },
    [feedKeyAvailable],
  );

  useEffect(() => {
    if (feedKeyError) {
      setError(feedKeyError);
    }
  }, [feedKeyError]);

  const processEvent = useCallback(
    async (event: Event) => {
      if (!hasFeedTag(event)) return;
      const body = await decodeEventContent(event);
      insertPost(mapEventToPost(event, false, body));
      try {
        await cacheMessage(eventToCached(event, body));
      } catch (cacheError) {
        console.warn("Unable to persist feed event", cacheError);
      }
    },
    [decodeEventContent, insertPost],
  );

  const handleEvent = useCallback(
    (event: Event) => {
      void processEvent(event);
    },
    [processEvent],
  );

  const startSubscription = useCallback(() => {
    if (!feedKeyAvailable) return;
    const pool = poolRef.current;
    if (!pool) return;

    subRef.current?.close();
    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 6;

    const subscription = pool.subscribeMany(
      RELAYS,
      [
        {
          kinds: [1],
          "#t": [FEED_TAG],
          since,
        },
      ],
      {
        onevent: (event) => {
          backoffRef.current = BASE_BACKOFF;
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          handleEvent(event);
        },
        onerror: (err) => {
          console.warn("Feed relay subscription error", err);
          if (reconnectTimerRef.current) {
            return;
          }
          const delay = Math.min(backoffRef.current, MAX_BACKOFF);
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
            startSubscription();
          }, delay);
        },
      },
    );

    subRef.current = subscription;
  }, [feedKeyAvailable, handleEvent]);

  useEffect(() => {
    if (!feedKeyAvailable) return;

    const pool = new SimplePool();
    poolRef.current = pool;
    let cancelled = false;

    pool
      .waitUntilReady()
      .then(() => {
        if (cancelled) return;
        setPoolReady(true);
        startSubscription();
      })
      .catch((loadError) => {
        if (cancelled) return;
        const message = loadError instanceof Error ? loadError.message : String(loadError);
        console.warn("Failed to initialize Nostr feed pool", loadError);
        setError(message);
      });

    return () => {
      cancelled = true;
      subRef.current?.close();
      pool.close(RELAYS);
      poolRef.current = null;
      setPoolReady(false);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [feedKeyAvailable, setError, startSubscription]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) {
      if (!hasMore) {
        setInitialLoading(false);
      }
      return;
    }
    const pool = poolRef.current;
    if (!pool) return;
    const isInitialLoad = !initialLoadRef.current;
    if (isInitialLoad) {
      initialLoadRef.current = true;
      setInitialLoading(true);
    }
    setLoadingMore(true);
    try {
      const until = oldestTimestampRef.current ? oldestTimestampRef.current - 1 : Math.floor(Date.now() / 1000);
      const events = await listFromRelays(pool, RELAYS, [
        {
          kinds: [1],
          "#t": [FEED_TAG],
          until,
          limit: LOAD_MORE_BATCH,
        },
      ]);
      if (events.length === 0) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }
      const filtered = events.filter(hasFeedTag);
      if (filtered.length === 0) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }
      const limited = filtered.slice(0, LOAD_MORE_BATCH);
      const decoded = await Promise.all(
        limited.map(async (event) => {
          const body = await decodeEventContent(event);
          return { post: mapEventToPost(event, false, body), cached: eventToCached(event, body) };
        }),
      );
      setPosts((prev) => {
        const merged = decoded.reduce((acc, entry) => upsertPost(acc, entry.post), prev);
        ensureOldestTimestamp(merged);
        return merged;
      });
      setHasMore(filtered.length >= LOAD_MORE_BATCH);
      await cacheMessages(
        FEED_ROOM_ID,
        decoded.map((entry) => entry.cached),
      );
    } catch (loadError) {
      console.warn("Failed to load additional feed events", loadError);
    } finally {
      setLoadingMore(false);
      if (isInitialLoad) {
        setInitialLoading(false);
      }
    }
  }, [ensureOldestTimestamp, hasMore, loadingMore]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    if (!poolReady) return;
    void loadMore();
  }, [loadMore, poolReady]);

  const stopRetryTimer = useCallback((id: string) => {
    const existing = retryTimersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      retryTimersRef.current.delete(id);
    }
  }, []);

  const attemptPublish = useCallback(
    async (event: Event, payload: FeedPayload, attempt = 0): Promise<void> => {
      const pool = poolRef.current;
      if (!pool) {
        setPosts((prev) => {
          const next = updatePostStatus(prev, event.id, "failed", "No relays available");
          ensureOldestTimestamp(next);
          return next;
        });
        setError("No relays available");
        stopRetryTimer(event.id);
        return;
      }

      try {
        await publishWithPool(pool, [FAST_RELAY], event);
        setPosts((prev) => {
          const next = updatePostStatus(prev, event.id, "ok");
          ensureOldestTimestamp(next);
          return next;
        });
        await cacheMessage(eventToCached(event, payload));
        if (RELAYS.length > 1) {
          void replicateWithPool(pool, RELAYS.slice(1), event);
        }
        stopRetryTimer(event.id);
      } catch (publishError) {
        const message = publishError instanceof Error ? publishError.message : String(publishError);
        const nextAttempt = attempt + 1;
        if (nextAttempt >= MAX_PUBLISH_ATTEMPTS) {
          setPosts((prev) => {
            const next = updatePostStatus(prev, event.id, "failed", message);
            ensureOldestTimestamp(next);
            return next;
          });
          setError(message);
          stopRetryTimer(event.id);
          return;
        }

        setPosts((prev) => {
          const next = updatePostStatus(prev, event.id, "pending", message);
          ensureOldestTimestamp(next);
          return next;
        });

        const delay = Math.min(RETRY_BASE_DELAY * 2 ** attempt, MAX_BACKOFF);
        const timer = setTimeout(() => {
          retryTimersRef.current.delete(event.id);
          void attemptPublish(event, payload, nextAttempt);
        }, delay);
        retryTimersRef.current.set(event.id, timer);
      }
    },
    [ensureOldestTimestamp, setError, stopRetryTimer],
  );

  const publishStatus = useCallback(
    async ({
      content,
      context,
      attachments = [],
    }: {
      content: string;
      context?: PublishContext | null;
      attachments?: FeedAttachment[];
    }): Promise<PublishResult> => {
      setPublishing(true);
      const trimmed = content.trim();
      if (!trimmed && attachments.length === 0) {
        setPublishing(false);
        throw new Error("Status update cannot be empty");
      }
      if (trimmed.length > 500) {
        setPublishing(false);
        throw new Error("Status updates are limited to 500 characters");
      }
      if (!signEvent) {
        setPublishing(false);
        throw new Error("Your Nostr keys are not ready yet");
      }
      const pool = poolRef.current;
      if (!pool) {
        setPublishing(false);
        throw new Error("No relays available");
      }

      try {
        await ensureFeedKey();

        const tags: string[][] = [
          ["t", FEED_TAG],
          ["app", "BitcoinSquare"],
          ["feed", FEED_TAG],
        ];

        if (context?.post) {
          tags.push(["e", context.post.id]);
          tags.push(["p", context.post.pubkey]);
          if (context.type === "quote") {
            tags.push(["q", context.post.id]);
          } else {
            tags.push(["reply", context.post.id]);
          }
        }

        const normalizedAttachments = attachments
          .map((attachment) => normalizeAttachment(attachment))
          .filter((attachment): attachment is FeedAttachment => Boolean(attachment));

        normalizedAttachments.forEach((attachment) => {
          tags.push(["url", attachment.url]);
          tags.push(["m", attachment.mimeType]);
          if (attachment.size) {
            tags.push(["size", String(attachment.size)]);
          }
          if (attachment.width && attachment.height) {
            tags.push(["dim", `${attachment.width}x${attachment.height}`]);
          } else if (attachment.dimensions) {
            tags.push(["dim", attachment.dimensions]);
          }
          if (attachment.digest) {
            tags.push(["x", attachment.digest]);
          }
          if (attachment.iv) {
            tags.push(["iv", attachment.iv]);
          }
        });

        const payload: FeedPayload = {
          body: trimmed,
          attachments: normalizedAttachments,
        };

        const encryptedContent = await encryptChannelJson(FEED_ROOM_ID, payload);

        const template: EventTemplate = {
          kind: 1,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content: encryptedContent,
        };

        const event = await signEvent(template);
        insertPost(mapEventToPost(event, true, payload));
        setError(null);

        void attemptPublish(event, payload, 0);
        return { eventId: event.id };
      } finally {
        setPublishing(false);
      }
    },
    [attemptPublish, ensureFeedKey, ensureOldestTimestamp, insertPost, signEvent],
  );

  useEffect(() => () => {
    retryTimersRef.current.forEach((timer) => {
      clearTimeout(timer);
    });
    retryTimersRef.current.clear();
  }, []);

  const likePost = useCallback(
    async (post: FeedPost) => {
      if (!signEvent) {
        throw new Error("Your Nostr keys are not ready yet");
      }
      const pool = poolRef.current;
      if (!pool) {
        throw new Error("No relays available");
      }
      const template: EventTemplate = {
        kind: 7,
        created_at: Math.floor(Date.now() / 1000),
        content: "+",
        tags: [
          ["e", post.id],
          ["p", post.pubkey],
          ["t", FEED_TAG],
          ["app", "BitcoinSquare"],
          ["feed", FEED_TAG],
        ],
      };
      const event = await signEvent(template);
      await publishWithPool(pool, [FAST_RELAY], event);
      if (RELAYS.length > 1) {
        void replicateWithPool(pool, RELAYS.slice(1), event);
      }
    },
    [signEvent],
  );

  return {
    posts,
    ready,
    publishing,
    publishStatus,
    likePost,
    loadMore,
    loadingMore,
    hasMore,
    error,
    pubkey,
    initialLoading,
  };
};
