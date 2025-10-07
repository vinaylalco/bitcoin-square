import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SimplePool, type Event, type EventTemplate, type Filter } from "nostr-tools";

import {
  cacheMessage,
  cacheMessages,
  getCachedMessages,
  type CachedMessage,
} from "../utils/chatCache";
import { useNostrAccount } from "./useNostrAccount";
import { publishWithPool, replicateWithPool } from "../lib/nostrPublish";

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://eden.nostr.land",
];

const FAST_RELAY = RELAYS[0];
const FEED_ROOM_ID = "bitcoinsquare-feed";
const FEED_TAG = "bitcoinsquare-feed";
const MAX_POSTS = 500;
const INITIAL_FETCH_LIMIT = 50;
const LOAD_MORE_BATCH = 40;
const BASE_BACKOFF = 1000;
const MAX_BACKOFF = 30_000;

export interface FeedAttachment {
  url: string;
  mimeType: string;
  dimensions?: string;
  size?: number;
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
    } else if (key === "size") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        current.size = parsed;
      }
    }
  }

  if (current) {
    attachments.push(current);
  }

  return attachments;
};

const eventToCached = (event: Event): CachedMessage => ({
  id: event.id,
  roomId: FEED_ROOM_ID,
  pubkey: event.pubkey,
  content: event.content,
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

const mapEventToPost = (event: Event, optimistic = false): FeedPost => ({
  id: event.id,
  pubkey: event.pubkey,
  created_at: event.created_at,
  content: event.content,
  tags: event.tags ?? [],
  attachments: parseAttachments(event.tags ?? []),
  status: optimistic ? "pending" : "ok",
  optimistic,
  error: undefined,
  event,
});

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
  publishStatus: (content: string) => Promise<PublishResult>;
  likePost: (post: FeedPost) => Promise<void>;
  repostPost: (post: FeedPost) => Promise<void>;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  pubkey: string | null;
}

export const useBitcoinSquareFeed = (): UseBitcoinSquareFeedReturn => {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [poolReady, setPoolReady] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const poolRef = useRef<SimplePool | null>(null);
  const subRef = useRef<ReturnType<SimplePool["subscribeMany"]> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(BASE_BACKOFF);
  const oldestTimestampRef = useRef<number | null>(null);
  const initialLoadRef = useRef(false);

  const { ready: accountReady, pubkey, signEvent } = useNostrAccount();

  const ready = useMemo(() => accountReady && poolReady, [accountReady, poolReady]);

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
        return;
      }
      const mapped = cached
        .map((entry) => mapEventToPost(cachedToEvent(entry)))
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, MAX_POSTS);
      setPosts(mapped);
      ensureOldestTimestamp(mapped);
      setHasMore(cached.length >= INITIAL_FETCH_LIMIT);
    } catch (cacheError) {
      console.warn("Failed to hydrate feed cache", cacheError);
    }
  }, [ensureOldestTimestamp]);

  useEffect(() => {
    void hydrateFromCache();
  }, [hydrateFromCache]);

  const handleEvent = useCallback(
    (event: Event) => {
      if (!hasFeedTag(event)) return;
      insertPost(mapEventToPost(event));
      void cacheMessage(eventToCached(event)).catch((cacheError) =>
        console.warn("Unable to persist feed event", cacheError),
      );
    },
    [insertPost],
  );

  const startSubscription = useCallback(() => {
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
  }, [handleEvent]);

  useEffect(() => {
    const pool = new SimplePool();
    poolRef.current = pool;
    setPoolReady(true);
    startSubscription();

    return () => {
      subRef.current?.close();
      pool.close(RELAYS);
      poolRef.current = null;
      setPoolReady(false);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [startSubscription]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const pool = poolRef.current;
    if (!pool) return;
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
      const mapped = limited.map((event) => mapEventToPost(event));
      setPosts((prev) => {
        const merged = mapped.reduce((acc, post) => upsertPost(acc, post), prev);
        ensureOldestTimestamp(merged);
        return merged;
      });
      setHasMore(filtered.length >= LOAD_MORE_BATCH);
      await cacheMessages(
        FEED_ROOM_ID,
        limited.map(eventToCached),
      );
    } catch (loadError) {
      console.warn("Failed to load additional feed events", loadError);
    } finally {
      setLoadingMore(false);
    }
  }, [ensureOldestTimestamp, hasMore, loadingMore]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    if (!poolReady) return;
    initialLoadRef.current = true;
    void loadMore();
  }, [loadMore, poolReady]);

  const publishStatus = useCallback(
    async (content: string): Promise<PublishResult> => {
      if (!content.trim()) {
        throw new Error("Status update cannot be empty");
      }
      if (content.length > 500) {
        throw new Error("Status updates are limited to 500 characters");
      }
      if (!signEvent) {
        throw new Error("Your Nostr keys are not ready yet");
      }
      const pool = poolRef.current;
      if (!pool) {
        throw new Error("No relays available");
      }

      const template: EventTemplate = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["t", FEED_TAG],
          ["app", "BitcoinSquare"],
          ["feed", FEED_TAG],
        ],
        content,
      };

      const event = await signEvent(template);
      insertPost(mapEventToPost(event, true));
      setError(null);

      try {
        setPublishing(true);
        await publishWithPool(pool, [FAST_RELAY], event);
        setPosts((prev) => {
          const next = updatePostStatus(prev, event.id, "ok");
          ensureOldestTimestamp(next);
          return next;
        });
        await cacheMessage(eventToCached(event));
        if (RELAYS.length > 1) {
          void replicateWithPool(pool, RELAYS.slice(1), event);
        }
        return { eventId: event.id };
      } catch (publishError) {
        setPosts((prev) => {
          const next = updatePostStatus(
            prev,
            event.id,
            "failed",
            publishError instanceof Error ? publishError.message : String(publishError),
          );
          ensureOldestTimestamp(next);
          return next;
        });
        setError(publishError instanceof Error ? publishError.message : String(publishError));
        throw publishError;
      } finally {
        setPublishing(false);
      }
    },
    [ensureOldestTimestamp, insertPost, signEvent],
  );

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

  const repostPost = useCallback(
    async (post: FeedPost) => {
      if (!signEvent) {
        throw new Error("Your Nostr keys are not ready yet");
      }
      const pool = poolRef.current;
      if (!pool) {
        throw new Error("No relays available");
      }
      const template: EventTemplate = {
        kind: 6,
        created_at: Math.floor(Date.now() / 1000),
        content: JSON.stringify(post.event),
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
    repostPost,
    loadMore,
    loadingMore,
    hasMore,
    error,
    pubkey,
  };
};
