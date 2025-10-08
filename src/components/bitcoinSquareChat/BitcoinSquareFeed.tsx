import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { FeedPost, PublishContext } from "../../hooks/useBitcoinSquareFeed";
import { useProfileIdentity, shortenPubkey } from "../../context/ProfileIdentityContext";
import { CASUAL_ROOM_ID, CASUAL_ROOM_NAME } from "../../hooks/useBitcoinSquareCasualChat";
import { useMediaUploader, type MediaUploadResult } from "../../hooks/useMediaUploader";
import ProfileCard from "../profile/ProfileCard";
import type { RoomDefinition } from "../RoomList";
import {
  Heart,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  MessageSquareQuote,
  Plus,
  X,
  Zap,
} from "lucide-react";

interface BitcoinSquareFeedProps {
  posts: FeedPost[];
  ready: boolean;
  publishing: boolean;
  publishStatus: (
    input: {
      content: string;
      context?: PublishContext | null;
      attachments?: FeedPost["attachments"];
    },
  ) => Promise<{ eventId: string }>;
  likePost: (post: FeedPost) => Promise<void>;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onSendLightning: (address: string) => void;
  canZap: boolean;
  pubkey: string | null;
}

type ActiveFilter = { type: "tag" | "mention"; value: string } | null;

type PendingMap = Set<string>;

type ComposerMode = "new" | "reply" | "quote";

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
  loadMore,
  loadingMore,
  hasMore,
  error,
  onSendLightning,
  canZap,
  pubkey,
}) => {
  const [content, setContent] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("new");
  const [composerTarget, setComposerTarget] = useState<FeedPost | null>(null);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);
  const [pendingLikes, setPendingLikes] = useState<PendingMap>(() => new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingMedia, setPendingMedia] = useState<MediaUploadResult[]>([]);
  const relativeFormatter = useMemo(() => createRelativeFormatter(), []);
  const now = useRelativeNow();
  const { requestProfile, resolveProfileSummary, openProfile } = useProfileIdentity();
  const feedRoom = useMemo<RoomDefinition>(
    () => ({
      id: CASUAL_ROOM_ID,
      name: CASUAL_ROOM_NAME,
      type: "private",
      hasLocalKey: true,
    }),
    [],
  );

  const {
    uploadFile: uploadMedia,
    progress: uploadProgress,
    status: uploadStatus,
    error: uploadError,
    reset: resetUpload,
  } = useMediaUploader({ room: feedRoom, pubkey });

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

  useEffect(() => {
    const uniquePubkeys = new Set<string>();
    posts.forEach((post) => uniquePubkeys.add(post.pubkey));
    uniquePubkeys.forEach((pubkey) => {
      requestProfile(pubkey).catch(() => undefined);
    });
  }, [posts, requestProfile]);

  const resetComposer = useCallback(() => {
    setComposerOpen(false);
    setComposerTarget(null);
    setComposerMode("new");
    setContent("");
    setComposerError(null);
    setPendingMedia([]);
    resetUpload();
  }, [resetUpload]);

  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleMediaUpload = useCallback(
    async (file: File) => {
      try {
        const result = await uploadMedia(file);
        setPendingMedia((prev) => [...prev, result]);
        setComposerError(null);
      } catch (mediaError) {
        const message = mediaError instanceof Error ? mediaError.message : String(mediaError);
        setComposerError(message);
        throw mediaError;
      } finally {
        resetUpload();
      }
    },
    [resetUpload, uploadMedia],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await handleMediaUpload(file);
      } catch {
        // handled in handleMediaUpload
      } finally {
        event.target.value = "";
      }
    },
    [handleMediaUpload],
  );

  const handleRemoveMedia = useCallback((cacheKey: string) => {
    setPendingMedia((prev) => prev.filter((item) => item.cacheKey !== cacheKey));
  }, []);

  const openComposerDialog = useCallback(
    (mode: ComposerMode, post?: FeedPost | null) => {
      setComposerMode(mode);
      setComposerTarget(post ?? null);
      if (mode === "reply" && post) {
        setContent(`@${shortenPubkey(post.pubkey)} `);
      } else if (mode === "quote" && post) {
        const quoted = post.content
          .split(/\r?\n/)
          .map((line) => `> ${line}`)
          .join("\n");
        setContent(`${quoted}\n\n`);
      } else {
        setContent("");
      }
      setComposerError(null);
      setComposerOpen(true);
    },
    [shortenPubkey],
  );

  useEffect(() => {
    if (!composerOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        resetComposer();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [composerOpen, resetComposer]);

  useEffect(() => {
    if (composerOpen && textareaRef.current) {
      const textarea = textareaRef.current;
      requestAnimationFrame(() => {
        textarea.focus();
        const length = textarea.value.length;
        textarea.setSelectionRange(length, length);
      });
    }
  }, [composerOpen]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!ready) return;
      const trimmed = content.trim();
      if (!trimmed && pendingMedia.length === 0) {
        setComposerError("Add a message or attach an image to post");
        return;
      }
      if (trimmed.length > 500) {
        setComposerError("Status updates cannot exceed 500 characters");
        return;
      }

      const attachments = pendingMedia.map((media) => ({
        url: media.url,
        mimeType: media.mimeType,
        size: media.size,
        width: media.width,
        height: media.height,
        digest: media.digest,
        iv: media.iv ?? null,
        eventId: media.eventId,
      }));

      try {
        setComposerError(null);
        await publishStatus({
          content: trimmed,
          context: composerTarget ? { type: composerMode, post: composerTarget } : undefined,
          attachments,
        });
        resetComposer();
      } catch (publishError) {
        setComposerError(
          publishError instanceof Error
            ? publishError.message
            : "We couldn't publish your status just yet.",
        );
      }
    },
    [composerMode, composerTarget, content, pendingMedia, publishStatus, ready, resetComposer],
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

  const composerTitle =
    composerMode === "reply"
      ? "Reply to note"
      : composerMode === "quote"
        ? "Quote note"
        : "Create community post";

  const submitLabel =
    composerMode === "reply"
      ? publishing
        ? "Replying…"
        : "Send reply"
      : composerMode === "quote"
        ? publishing
          ? "Posting quote…"
          : "Post quote"
        : publishing
          ? "Posting…"
          : "Post update";

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
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

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6 pb-28">
        {!ready && (
          <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-muted)]">
            We generate a local signing key automatically to publish updates. Once it is ready you can post to the feed instantly.
          </div>
        )}

        {error && !composerOpen && (
          <p className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500">{error}</p>
        )}

        {filteredPosts.length === 0 ? (
          <p className="text-sm text-[var(--fg-muted)]">
            No posts yet{activeFilter ? " for this filter." : "."} Be the first to share what you’re working on!
          </p>
        ) : (
          filteredPosts.map((post) => {
            const profile = resolveProfileSummary(post.pubkey);
            const isPendingLike = pendingLikes.has(post.id);
            const likeDisabled = !ready || isPendingLike;
            const statusLabel =
              post.status === "pending"
                ? "Posting to relays…"
                : post.status === "failed"
                  ? post.error ?? "Delivery failed."
                  : null;

            return (
              <article
                key={post.id}
                className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm transition hover:border-brand/60"
              >
                <header className="flex flex-wrap items-start justify-between gap-4">
                  <ProfileCard
                    pubkey={post.pubkey}
                    contentClassName="items-start"
                    className="flex-1"
                    subtitle={shortenPubkey(post.pubkey)}
                    meta={
                      <span className="text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                        {formatRelativeTime(post.created_at)}
                      </span>
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      openProfile(post.pubkey);
                    }}
                  />
                </header>

                <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--fg-default)]">
                  {renderContent(post.content, handleTagClick, handleMentionClick)}
                </div>

                {post.attachments.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {post.attachments.map((attachment, index) => {
                      const metaParts: string[] = [];
                      if (attachment.width && attachment.height) {
                        metaParts.push(`${attachment.width}x${attachment.height}`);
                      } else if (attachment.dimensions) {
                        metaParts.push(attachment.dimensions);
                      }
                      if (attachment.size) {
                        metaParts.push(`${(attachment.size / 1024).toFixed(1)} KB`);
                      }
                      return (
                        <div
                          key={`${post.id}-attachment-${index}`}
                          className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60"
                        >
                          {attachment.mimeType.startsWith("video/") ? (
                            <video src={attachment.url} controls className="max-h-80 w-full rounded-2xl" />
                          ) : (
                            <img src={attachment.url} alt="Feed attachment" className="w-full object-contain" loading="lazy" />
                          )}
                          {metaParts.length > 0 && (
                            <p className="px-3 py-2 text-xs text-[var(--fg-muted)]">{metaParts.join(" • ")}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {statusLabel && <p className="mt-3 text-xs text-[var(--fg-muted)]">{statusLabel}</p>}

                <div className="mt-4 flex flex-wrap items-center gap-2 text-[var(--fg-muted)]">
                  <button
                    type="button"
                    onClick={() => openComposerDialog("reply", post)}
                    disabled={!ready}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
                    title="Reply to this post"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span className="sr-only">Reply</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openComposerDialog("quote", post)}
                    disabled={!ready}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
                    title="Quote this post"
                  >
                    <MessageSquareQuote className="h-4 w-4" />
                    <span className="sr-only">Quote</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLike(post)}
                    disabled={likeDisabled}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
                      isPendingLike
                        ? "border-brand text-brand"
                        : "border-[var(--border-subtle)] text-[var(--fg-muted)] hover:border-brand hover:text-brand"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    title={isPendingLike ? "Sending like…" : "Like this post"}
                  >
                    {isPendingLike ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
                    <span className="sr-only">Like</span>
                  </button>
                  {profile.lightningAddress && (
                    <button
                      type="button"
                      onClick={() => onSendLightning(profile.lightningAddress!)}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
                        canZap
                          ? "border-brand/40 text-brand hover:border-brand"
                          : "border-dashed border-[var(--border-subtle)] text-[var(--fg-muted)] hover:border-brand/40"
                      }`}
                      title={
                        canZap
                          ? "Send sats via Lightning"
                          : "Add your Lightning address on the dashboard to zap"
                      }
                    >
                      <Zap className="h-4 w-4" />
                      <span className="sr-only">Send sats</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}

        <div ref={sentinelRef} />
        {loadingMore && <p className="text-center text-xs text-[var(--fg-muted)]">Loading more posts…</p>}
        {!hasMore && filteredPosts.length > 0 && (
          <p className="text-center text-xs text-[var(--fg-muted)]">You reached the end of the feed.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => openComposerDialog("new")}
        disabled={!ready}
        className="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-brand/40"
        aria-label="Create a new community post"
      >
        <Plus className="h-6 w-6" />
      </button>

      {composerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 py-8 sm:items-center">
          <div className="absolute inset-0" onClick={resetComposer} aria-hidden="true" />
          <div className="relative w-full max-w-xl rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-2xl">
            <header className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold uppercase tracking-[0.18em] text-[var(--fg-default)]">{composerTitle}</h2>
              <button
                type="button"
                onClick={resetComposer}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
                aria-label="Close composer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {composerTarget && (
              <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-xs text-[var(--fg-muted)]">
                <p className="font-semibold text-[var(--fg-default)]">
                  {composerMode === "reply" ? "Replying to" : "Quoting"} {shortenPubkey(composerTarget.pubkey)}
                </p>
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-[var(--fg-muted)]">{composerTarget.content}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(event) => setContent(event.target.value.slice(0, 500))}
                className="min-h-[160px] w-full resize-y rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-default)] shadow-inner focus:border-brand focus:outline-none"
                placeholder={
                  composerMode === "reply"
                    ? "Share your thoughts…"
                    : composerMode === "quote"
                      ? "Add your perspective…"
                      : "What’s happening in your corner of BitcoinSquare?"
                }
                disabled={!ready || publishing}
              />
              {pendingMedia.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {pendingMedia.map((media) => (
                    <div
                      key={media.cacheKey}
                      className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60"
                    >
                      <img
                        src={media.previewUrl ?? media.url}
                        alt="Selected attachment"
                        className="h-40 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveMedia(media.cacheKey)}
                        className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-brand"
                        aria-label="Remove attachment"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--fg-muted)]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={triggerFilePicker}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
                    disabled={!ready || publishing || uploadStatus === "uploading"}
                    title="Attach media"
                  >
                    {uploadStatus === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                    <span className="sr-only">Attach media</span>
                  </button>
                  {uploadStatus === "uploading" && (
                    <span>Uploading… {uploadProgress}%</span>
                  )}
                  {uploadError && <span className="text-red-500">{uploadError}</span>}
                </div>
                <span>{content.length}/500</span>
              </div>
              {composerError && <p className="text-xs text-red-500">{composerError}</p>}
              <button
                type="submit"
                disabled={!ready || publishing}
                className="w-full rounded-full bg-brand px-6 py-2 text-sm font-semibold uppercase tracking-[0.24em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-brand/40"
              >
                {submitLabel}
              </button>
              {error && (
                <p className="text-center text-xs text-red-500">{error}</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BitcoinSquareFeed;
