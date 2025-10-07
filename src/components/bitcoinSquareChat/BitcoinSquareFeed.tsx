import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { FeedPost } from "../../hooks/useBitcoinSquareFeed";

interface ProfileSummary {
  displayName: string;
  avatarUrl: string;
  profileUrl: string;
}

interface BitcoinSquareFeedProps {
  posts: FeedPost[];
  ready: boolean;
  publishing: boolean;
  publishStatus: (content: string) => Promise<{ eventId: string }>;
  likePost: (post: FeedPost) => Promise<void>;
  repostPost: (post: FeedPost) => Promise<void>;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  resolveProfile: (pubkey: string) => ProfileSummary;
  onOpenProfile: (pubkey: string) => void;
}

type ActiveFilter = { type: "tag" | "mention"; value: string } | null;

type PendingMap = Set<string>;

const createRelativeFormatter = () => {
  try {
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  } catch (error) {
    console.warn("Relative time format not supported", error);
    return null;
  }
};

const useRelativeNow = () => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
};

const isHexKey = (value: string) => /^[0-9a-f]{6,}$/i.test(value);

const tokenizeLine = (
  line: string,
  onTagClick: (tag: string) => void,
  onMentionClick: (pubkey: string) => void,
) =>
  line.split(/(\s+)/).map((token, index) => {
    if (/^#[^\s#@]+$/.test(token)) {
      const value = token.slice(1);
      return (
        <button
          key={`${token}-${index}`}
          type="button"
          onClick={() => onTagClick(value)}
          className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand transition hover:bg-brand/20"
        >
          {token}
        </button>
      );
    }
    if (/^@[0-9a-f]{6,}$/i.test(token)) {
      const value = token.slice(1);
      return (
        <button
          key={`${token}-${index}`}
          type="button"
          onClick={() => onMentionClick(value)}
          className="rounded-full bg-[var(--bg-muted)] px-2 py-0.5 text-xs font-medium text-[var(--fg-default)] transition hover:bg-[var(--bg-muted)]/80"
        >
          {token}
        </button>
      );
    }
    return token;
  });

const renderContent = (
  content: string,
  onTagClick: (tag: string) => void,
  onMentionClick: (pubkey: string) => void,
) => {
  const lines = content.split(/\n/);
  return lines.flatMap((line, lineIndex) => {
    const nodes = tokenizeLine(line, onTagClick, onMentionClick);
    if (lineIndex === lines.length - 1) {
      return nodes;
    }
    return [...nodes, <br key={`break-${lineIndex}`} />];
  });
};

const BitcoinSquareFeed: React.FC<BitcoinSquareFeedProps> = ({
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
  resolveProfile,
  onOpenProfile,
}) => {
  const [content, setContent] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);
  const [pendingLikes, setPendingLikes] = useState<PendingMap>(() => new Set());
  const [pendingReposts, setPendingReposts] = useState<PendingMap>(() => new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const relativeFormatter = useMemo(() => createRelativeFormatter(), []);
  const now = useRelativeNow();

  useEffect(() => {
    if (!hasMore) return;
    if (typeof IntersectionObserver !== "function") return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          if (!loadingMore) {
            void loadMore();
          }
        }
      },
      { rootMargin: "256px" },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadMore, loadingMore]);

  const updatePending = useCallback((setter: React.Dispatch<React.SetStateAction<PendingMap>>, id: string, add: boolean) => {
    setter((prev) => {
      const next = new Set(prev);
      if (add) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = content.trim();
      if (!trimmed) {
        setComposerError("Please share something before posting");
        return;
      }
      if (trimmed.length > 500) {
        setComposerError("Status updates cannot exceed 500 characters");
        return;
      }
      try {
        setComposerError(null);
        await publishStatus(content);
        setContent("");
      } catch (publishError) {
        setComposerError(
          publishError instanceof Error ? publishError.message : "We couldn't publish your status just yet.",
        );
      }
    },
    [content, publishStatus],
  );

  const filteredPosts = useMemo(() => {
    if (!activeFilter) return posts;
    if (activeFilter.type === "tag") {
      const target = activeFilter.value.toLowerCase();
      return posts.filter((post) =>
        post.tags.some((tag) => tag[0] === "t" && tag[1]?.toLowerCase() === target) ||
        post.content.toLowerCase().includes(`#${target}`),
      );
    }
    const target = activeFilter.value.toLowerCase();
    return posts.filter((post) =>
      post.pubkey.toLowerCase() === target ||
      post.tags.some((tag) => tag[0] === "p" && tag[1]?.toLowerCase() === target) ||
      post.content.toLowerCase().includes(`@${target}`),
    );
  }, [activeFilter, posts]);

  const clearFilter = useCallback(() => setActiveFilter(null), []);

  const handleTagClick = useCallback((tag: string) => {
    setActiveFilter({ type: "tag", value: tag.toLowerCase() });
  }, []);

  const handleMentionClick = useCallback((value: string) => {
    if (!isHexKey(value)) return;
    setActiveFilter({ type: "mention", value: value.toLowerCase() });
  }, []);

  const formatRelativeTime = useCallback(
    (timestamp: number) => {
      const diffSeconds = Math.round((timestamp * 1000 - now) / 1000);
      const abs = Math.abs(diffSeconds);
      if (!relativeFormatter) {
        return new Date(timestamp * 1000).toLocaleString();
      }
      const units: { limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }[] = [
        { limit: 60, divisor: 1, unit: "second" },
        { limit: 3600, divisor: 60, unit: "minute" },
        { limit: 86_400, divisor: 3600, unit: "hour" },
        { limit: 604_800, divisor: 86_400, unit: "day" },
        { limit: 2_629_800, divisor: 604_800, unit: "week" },
        { limit: 31_557_600, divisor: 2_629_800, unit: "month" },
        { limit: Infinity, divisor: 31_557_600, unit: "year" },
      ];
      for (const { limit, divisor, unit } of units) {
        if (abs < limit) {
          const value = Math.round(diffSeconds / divisor);
          return relativeFormatter.format(value, unit);
        }
      }
      return relativeFormatter.format(Math.round(diffSeconds / 31_557_600), "year");
    },
    [now, relativeFormatter],
  );

  const handleLike = useCallback(
    async (post: FeedPost) => {
      updatePending(setPendingLikes, post.id, true);
      try {
        await likePost(post);
      } catch (reactionError) {
        console.warn("Unable to react to post", reactionError);
      } finally {
        updatePending(setPendingLikes, post.id, false);
      }
    },
    [likePost, updatePending],
  );

  const handleRepost = useCallback(
    async (post: FeedPost) => {
      updatePending(setPendingReposts, post.id, true);
      try {
        await repostPost(post);
      } catch (repostError) {
        console.warn("Unable to repost", repostError);
      } finally {
        updatePending(setPendingReposts, post.id, false);
      }
    },
    [repostPost, updatePending],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <section className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          {!ready && (
            <p className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-muted)]">
              We generate a local signing key automatically to publish updates. Once it is ready you can post to the feed instantly.
            </p>
          )}
          <div className="space-y-2">
            <label htmlFor="feed-status" className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">
              Share an update with the BitcoinSquare community
            </label>
            <textarea
              id="feed-status"
              name="feed-status"
              value={content}
              onChange={(event) => setContent(event.target.value.slice(0, 500))}
              className="min-h-[120px] w-full resize-y rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-default)] shadow-inner focus:border-brand focus:outline-none"
              placeholder="What’s happening in your corner of BitcoinSquare?"
              disabled={!ready || publishing}
            />
            <div className="flex items-center justify-between text-xs text-[var(--fg-muted)]">
              <span>{content.length}/500</span>
              {composerError && <span className="text-red-500">{composerError}</span>}
            </div>
          </div>
          <button
            type="submit"
            disabled={!ready || publishing}
            className="rounded-full bg-brand px-6 py-2 text-sm font-semibold uppercase tracking-[0.24em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-brand/40"
          >
            {publishing ? "Posting…" : "Post update"}
          </button>
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
        </form>
      </section>

      {activeFilter && (
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-6 py-3 text-xs text-[var(--fg-muted)]">
          <span>
            Filtering by {activeFilter.type === "tag" ? `#${activeFilter.value}` : `@${activeFilter.value}`}
          </span>
          <button
            type="button"
            onClick={clearFilter}
            className="ml-3 rounded-full border border-[var(--border-subtle)] px-3 py-1 font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
          >
            Clear filter
          </button>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {filteredPosts.length === 0 ? (
          <p className="text-sm text-[var(--fg-muted)]">
            No posts yet{activeFilter ? " for this filter." : "."} Be the first to share what you’re working on!
          </p>
        ) : (
          filteredPosts.map((post) => {
            const profile = resolveProfile(post.pubkey);
            const isPendingLike = pendingLikes.has(post.id);
            const isPendingRepost = pendingReposts.has(post.id);
            const likeDisabled = !ready || isPendingLike;
            const repostDisabled = !ready || isPendingRepost;
            const statusLabel = post.status === "pending" ? "Posting to relays…" : post.status === "failed" ? post.error ?? "Delivery failed." : null;

            return (
              <article
                key={post.id}
                className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm transition hover:border-brand/60"
              >
                <header className="flex flex-wrap items-start justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => onOpenProfile(post.pubkey)}
                    className="flex items-start gap-4 text-left"
                  >
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      className="h-12 w-12 flex-shrink-0 rounded-full border border-[var(--border-subtle)] object-cover"
                      loading="lazy"
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold text-[var(--fg-default)]">{profile.displayName}</span>
                        <span className="text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                          {formatRelativeTime(post.created_at)}
                        </span>
                      </div>
                      <span className="text-xs text-[var(--fg-muted)]">{post.pubkey.slice(0, 8)}…{post.pubkey.slice(-8)}</span>
                    </div>
                  </button>
                  <a
                    href={profile.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
                  >
                    View profile
                  </a>
                </header>

                <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--fg-default)]">
                  {renderContent(post.content, handleTagClick, handleMentionClick)}
                </div>

                {post.attachments.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {post.attachments.map((attachment, index) => (
                      <div key={`${post.id}-attachment-${index}`} className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60">
                        {attachment.mimeType.startsWith("video/") ? (
                          <video src={attachment.url} controls className="max-h-80 w-full rounded-2xl" />
                        ) : (
                          <img src={attachment.url} alt="Feed attachment" className="w-full object-contain" loading="lazy" />
                        )}
                        {(attachment.dimensions || attachment.size) && (
                          <p className="px-3 py-2 text-xs text-[var(--fg-muted)]">
                            {attachment.dimensions && <span>{attachment.dimensions}</span>}
                            {attachment.dimensions && attachment.size && <span className="mx-1">•</span>}
                            {attachment.size && <span>{(attachment.size / 1024).toFixed(1)} KB</span>}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {statusLabel && <p className="mt-3 text-xs text-[var(--fg-muted)]">{statusLabel}</p>}

                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--fg-muted)]">
                  <button
                    type="button"
                    onClick={() => handleLike(post)}
                    disabled={likeDisabled}
                    className="flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-1 font-semibold uppercase tracking-[0.18em] transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPendingLike ? "Liking…" : "Like"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRepost(post)}
                    disabled={repostDisabled}
                    className="flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-1 font-semibold uppercase tracking-[0.18em] transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPendingRepost ? "Reposting…" : "Repost"}
                  </button>
                </div>
              </article>
            );
          })
        )}

        <div ref={sentinelRef} />
        {loadingMore && (
          <p className="text-center text-xs text-[var(--fg-muted)]">Loading more posts…</p>
        )}
        {!hasMore && filteredPosts.length > 0 && (
          <p className="text-center text-xs text-[var(--fg-muted)]">You reached the end of the feed.</p>
        )}
      </div>
    </div>
  );
};

export default BitcoinSquareFeed;
