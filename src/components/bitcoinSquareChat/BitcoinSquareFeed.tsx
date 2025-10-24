import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { FeedPost, PublishContext } from "../../hooks/useBitcoinSquareFeed";
import { useProfileIdentity, shortenPubkey } from "../../context/ProfileIdentityContext";
import type { ProfileSummary } from "../../context/ProfileIdentityContext";
import { CASUAL_ROOM_ID, CASUAL_ROOM_NAME } from "../../hooks/useBitcoinSquareCasualChat";
import { useCommunityTranslation } from "../../context/CommunityTranslationContext";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import ProfileCard from "../profile/ProfileCard";
import ErrorBoundary from "../ErrorBoundary";
import type { RoomDefinition } from "../RoomList";
import { Heart, ImagePlus, Loader2, MessageCircle, Plus, Share2, Trash2, X } from "lucide-react";
import {
  createFeedActionHandlers,
  createOpenComposerDialog,
  type ComposerMode,
  type PendingMap,
} from "./feedActions";
import { rewriteImgBbUrlToProxy, rewriteImgBbUrlsInText } from "../../utils/imageProxy";
import { extractMarkdownImageUrls } from "../../utils/markdown";
import {
  createPlaceholderImageDetails,
  uploadImageViaWorker,
  validateImageFile,
  type UploadedImageDetails,
} from "../../utils/imageUpload";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import {
  collectMentionSelections,
  normalizeMentionLabel,
  type MentionTarget,
} from "../../utils/mentions";

interface BitcoinSquareFeedProps {
  posts: FeedPost[];
  ready: boolean;
  publishing: boolean;
  publishStatus: (
    input: {
      content: string;
      context?: PublishContext | null;
      attachments?: FeedPost["attachments"];
      mentionPubkeys?: string[];
    },
  ) => Promise<{ eventId: string }>;
  likePost: (post: FeedPost) => Promise<void>;
  deletePost: (post: FeedPost) => Promise<void>;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  pubkey: string | null;
  initialLoading: boolean;
  initialThreadId?: string | null;
  onThreadChange?: (postId: string | null) => void;
  mentionTargets?: MentionTarget[];
}

type ActiveFilter =
  | { type: "tag"; value: string }
  | { type: "mention"; pubkey: string; label: string }
  | { type: "media" }
  | { type: "mentions" }
  | { type: "mine" }
  | null;

type QuickFilterType = "media" | "mentions" | "mine";

const LONG_POST_CHAR_THRESHOLD = 320;
const LONG_POST_LINE_THRESHOLD = 6;
const COMPOSER_STORAGE_KEY = "bitcoinsquare-feed-composer-state";
const MENTION_SUGGESTION_LIMIT = 6;

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

const tokenizeLine = (
  line: string,
  onTagClick: (tag: string) => void,
  resolveMention: (label: string) => { pubkey: string; label: string } | null,
  onMentionClick: (pubkey: string, label: string) => void,
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
    if (/^@[0-9a-zA-Z_]{1,64}$/.test(token)) {
      const rawLabel = token.slice(1);
      const mention = resolveMention(rawLabel);
      if (mention) {
        return (
          <a
            key={`${token}-${index}`}
            href={`/profile/${mention.pubkey}`}
            onClick={(event) => {
              event.preventDefault();
              onMentionClick(mention.pubkey, mention.label);
            }}
            className="rounded-full bg-[var(--bg-muted)] px-2 py-0.5 text-xs font-medium text-[var(--fg-default)] transition hover:bg-[var(--bg-muted)]/80"
          >
            @{mention.label}
          </a>
        );
      }
    }
    return token;
  });

const isLongPost = (content: string) =>
  content.length > LONG_POST_CHAR_THRESHOLD || content.split(/\n/).length > LONG_POST_LINE_THRESHOLD;

const getCollapsedContent = (content: string) => {
  if (!isLongPost(content)) {
    return content;
  }
  const truncated = content.slice(0, LONG_POST_CHAR_THRESHOLD).trimEnd();
  return `${truncated}${truncated.length < content.length ? "…" : ""}`;
};

const buildPostSnippet = (content: string) => {
  const condensed = content.replace(/\s+/g, " ").trim();
  if (condensed.length <= 220) {
    return condensed;
  }
  return `${condensed.slice(0, 217)}…`;
};

const extractPostReference = (
  tags: string[][],
): { type: "quote" | "reply"; id: string } | null => {
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === "q" && typeof tag[1] === "string" && tag[1].trim().length > 0) {
      return { type: "quote", id: tag[1] };
    }
  }
  for (const tag of tags) {
    if (
      Array.isArray(tag) &&
      tag[0] === "reply" &&
      typeof tag[1] === "string" &&
      tag[1].trim().length > 0
    ) {
      return { type: "reply", id: tag[1] };
    }
  }
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === "e" && typeof tag[1] === "string" && tag[1].trim().length > 0) {
      return { type: "reply", id: tag[1] };
    }
  }
  return null;
};

const referencesPost = (post: FeedPost, targetId: string) =>
  post.tags?.some((tag) => {
    if (!Array.isArray(tag)) return false;
    const [type, value] = tag;
    if (typeof value !== "string") return false;
    if (value.trim().length === 0) return false;
    return (type === "reply" || type === "e" || type === "q") && value.trim() === targetId;
  }) ?? false;

const formatAbsoluteTimestamp = (unixSeconds: number | null | undefined) => {
  if (!unixSeconds) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(unixSeconds * 1000));
  } catch {
    return new Date(unixSeconds * 1000).toLocaleString();
  }
};

const renderContent = (
  content: string,
  onTagClick: (tag: string) => void,
  resolveMention: (label: string) => { pubkey: string; label: string } | null,
  onMentionClick: (pubkey: string, label: string) => void,
) => {
  const lines = content.split(/\n/);
  return lines.flatMap((line, lineIndex) => {
    const nodes = tokenizeLine(line, onTagClick, resolveMention, onMentionClick);
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
  deletePost,
  loadMore,
  loadingMore,
  hasMore,
  error,
  pubkey,
  initialLoading,
  initialThreadId = null,
  onThreadChange,
  mentionTargets: externalMentionTargets,
}) => {
  const [content, setContent] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("new");
  const [composerTarget, setComposerTarget] = useState<FeedPost | null>(null);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);
  const [pendingLikes, setPendingLikes] = useState<PendingMap>(() => new Set());
  const [pendingDeletes, setPendingDeletes] = useState<PendingMap>(() => new Set());
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(() => new Set());
  const [expandedEventDetails, setExpandedEventDetails] = useState<Set<string>>(() => new Set());
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);
  const [showNewPostsToast, setShowNewPostsToast] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const latestKnownPostRef = useRef<string | null>(null);
  const persistedComposerTargetIdRef = useRef<string | null>(null);
  const postRefs = useRef(new Map<string, HTMLDivElement>());
  const highlightTimerRef = useRef<number | null>(null);
  const unresolvedThreadRef = useRef<string | null>(null);
  const lastThreadLoadAttemptRef = useRef<{ id: string; timestamp: number } | null>(null);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImageDetails[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  const [mentionState, setMentionState] = useState<{ active: boolean; start: number; query: string }>(
    { active: false, start: 0, query: "" },
  );
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const relativeFormatter = useMemo(() => createRelativeFormatter(), []);
  const now = useRelativeNow();
  const { requestProfile, resolveProfileSummary, openProfile, profiles, following } = useProfileIdentity();
  const { showToast } = useToast();
  const { user } = useAuth();
  const canModerate = user?.isAdmin === true;
  const {
    isSupported: translationSupported,
    autoTranslateEnabled,
    ensureTranslation,
    refreshTranslation,
    getTranslation,
    isOriginalVisible,
    toggleOriginal,
    formatLanguageName,
  } = useCommunityTranslation();
  const translationEnabled = translationSupported && autoTranslateEnabled;
  const feedRoom = useMemo<RoomDefinition>(
    () => ({
      id: CASUAL_ROOM_ID,
      name: CASUAL_ROOM_NAME,
      type: "private",
      hasLocalKey: true,
    }),
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(COMPOSER_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        content?: string;
        open?: boolean;
        mode?: ComposerMode;
        targetId?: string | null;
      };
      if (typeof parsed.content === "string") {
        const normalized = rewriteImgBbUrlsInText(parsed.content, { absolute: true });
        setContent(normalized.slice(0, 500));
      }
      if (parsed.open) {
        setComposerOpen(true);
      }
      if (parsed.mode === "reply" || parsed.mode === "quote") {
        setComposerMode(parsed.mode);
      }
      if (parsed.targetId) {
        persistedComposerTargetIdRef.current = parsed.targetId;
      }
    } catch (storageError) {
      console.warn("Failed to restore composer draft", storageError);
    }
  }, []);

  useEffect(() => {
    if (!persistedComposerTargetIdRef.current) return;
    const targetId = persistedComposerTargetIdRef.current;
    const target = posts.find((post) => post.id === targetId);
    if (target) {
      setComposerTarget(target);
      persistedComposerTargetIdRef.current = null;
      return;
    }
    if (posts.length > 0) {
      setComposerMode("new");
      persistedComposerTargetIdRef.current = null;
    }
  }, [posts]);

  const debouncedMentionQuery = useDebouncedValue(mentionState.query, 300);
  const composerMentionTargets = useMemo<MentionTarget[]>(() => {
    if (externalMentionTargets && externalMentionTargets.length > 0) {
      return externalMentionTargets;
    }
    const targets = new Map<string, MentionTarget>();
    const currentPubkey = pubkey?.toLowerCase() ?? null;

    const addTarget = (candidate?: string | null) => {
      if (!candidate) return;
      const normalized = candidate.trim().toLowerCase();
      if (normalized.length !== 64) {
        return;
      }
      if (currentPubkey && normalized === currentPubkey) {
        return;
      }
      if (targets.has(normalized)) {
        return;
      }
      const profileEntry = profiles?.[normalized];
      const summary = resolveProfileSummary(normalized);
      const screenName = profileEntry?.data?.screenName ?? profileEntry?.data?.displayName ?? summary.displayName;
      targets.set(normalized, {
        pubkey: normalized,
        screenName: screenName?.replace(/^@/, "") ?? summary.displayName,
        displayName: summary.displayName,
        avatarUrl: summary.avatarUrl,
      });
    };

    posts.forEach((post) => addTarget(post.pubkey));
    if (composerTarget) {
      addTarget(composerTarget.pubkey);
    }
    following.forEach((followed) => addTarget(followed));
    Object.keys(profiles).forEach((key) => addTarget(key));

    const sorted = Array.from(targets.values());
    sorted.sort((a, b) => {
      const primaryA = a.screenName || a.displayName || a.pubkey;
      const primaryB = b.screenName || b.displayName || b.pubkey;
      const primaryCompare = primaryA.localeCompare(primaryB, undefined, {
        sensitivity: "base",
        numeric: true,
      });
      if (primaryCompare !== 0) {
        return primaryCompare;
      }
      const secondaryA = a.displayName || a.pubkey;
      const secondaryB = b.displayName || b.pubkey;
      return secondaryA.localeCompare(secondaryB, undefined, { sensitivity: "base", numeric: true });
    });
    return sorted;
  }, [composerTarget, externalMentionTargets, following, posts, profiles, pubkey, resolveProfileSummary]);
  const mentionLookup = useMemo(() => {
    const map = new Map<string, MentionTarget>();
    composerMentionTargets.forEach((target) => {
      const screen = target.screenName?.trim().replace(/^@/, "");
      if (screen) {
        map.set(screen.toLowerCase(), target);
      }
      if (target.pubkey) {
        map.set(target.pubkey.toLowerCase(), target);
      }
    });
    return map;
  }, [composerMentionTargets]);
  const resolveMention = useCallback(
    (label: string) => {
      const normalized = normalizeMentionLabel(label);
      if (!normalized) {
        return null;
      }
      const directTarget = mentionLookup.get(normalized);
      if (directTarget) {
        const displayLabel = directTarget.screenName || directTarget.displayName || shortenPubkey(directTarget.pubkey);
        return { pubkey: directTarget.pubkey, label: displayLabel.replace(/^@/, "") };
      }
      if (/^[0-9a-f]{64}$/i.test(normalized)) {
        const summary = resolveProfileSummary(normalized);
        const displayLabel = summary.displayName || shortenPubkey(normalized);
        return { pubkey: normalized, label: displayLabel.replace(/^@/, "") };
      }
      return null;
    },
    [mentionLookup, resolveProfileSummary, shortenPubkey],
  );
  const filteredMentionTargets = useMemo(() => {
    if (!mentionState.active) {
      return [] as MentionTarget[];
    }
    const query = debouncedMentionQuery.trim().toLowerCase();
    const source = composerMentionTargets.filter((target) => target.pubkey.length === 64);
    if (query.length === 0) {
      return source.slice(0, MENTION_SUGGESTION_LIMIT);
    }
    return source
      .filter((target) => {
        const screen = target.screenName?.toLowerCase() ?? "";
        const display = target.displayName?.toLowerCase() ?? "";
        return screen.includes(query) || display.includes(query);
      })
      .slice(0, MENTION_SUGGESTION_LIMIT);
  }, [composerMentionTargets, debouncedMentionQuery, mentionState.active]);
  const mentionDropdownVisible = mentionState.active && filteredMentionTargets.length > 0;
  const requestedMentionProfilesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    composerMentionTargets.forEach((target) => {
      if (requestedMentionProfilesRef.current.has(target.pubkey)) {
        return;
      }
      requestedMentionProfilesRef.current.add(target.pubkey);
      void requestProfile(target.pubkey);
    });
  }, [composerMentionTargets, requestProfile]);

  useEffect(() => {
    if (!mentionDropdownVisible) {
      setHighlightedMentionIndex(0);
      return;
    }
    setHighlightedMentionIndex((current) => {
      if (filteredMentionTargets.length === 0) {
        return 0;
      }
      return Math.min(current, filteredMentionTargets.length - 1);
    });
  }, [filteredMentionTargets.length, mentionDropdownVisible]);

  const closeMention = useCallback(() => {
    setMentionState({ active: false, start: 0, query: "" });
  }, []);

  const updateMentionState = useCallback(
    (text: string, caret: number) => {
      if (!composerMentionTargets.length) {
        return;
      }
      const safeCaret = Number.isFinite(caret) ? Math.max(0, Math.min(text.length, caret)) : text.length;
      const slice = text.slice(0, safeCaret);
      const match = slice.match(/(^|\s)@([0-9a-zA-Z_]{0,64})$/);
      if (match) {
        const query = match[2] ?? "";
        const start = safeCaret - query.length - 1;
        setMentionState({ active: true, start, query });
      } else {
        closeMention();
      }
    },
    [closeMention, composerMentionTargets.length],
  );

    const applyMention = useCallback(
      (target: MentionTarget) => {
        if (!mentionState.active) {
          return;
        }
        const textarea = textareaRef.current;
        const currentValue = textarea ? textarea.value : content;
        const selectionEnd = textarea?.selectionStart ?? currentValue.length;
        const start = mentionState.start;
        if (start < 0 || start > currentValue.length) {
          closeMention();
          return;
        }
        const before = currentValue.slice(0, start);
        const after = currentValue.slice(selectionEnd);
        const baseLabel =
          target.screenName?.trim().replace(/^@/, "") || target.displayName?.trim() || target.pubkey;
        const mentionText = `@${baseLabel}`;
        const needsTrailingSpace = after.length === 0 || /^\S/.test(after) ? " " : "";
        const nextValue = `${before}${mentionText}${needsTrailingSpace}${after}`;
        setContent(nextValue.slice(0, 500));
      closeMention();
      if (textarea) {
        const position = before.length + mentionText.length + (needsTrailingSpace ? 1 : 0);
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => {
            textarea.focus();
            try {
              textarea.setSelectionRange(position, position);
            } catch {
              // ignore selection errors
            }
          });
        } else {
          textarea.focus();
          try {
            textarea.setSelectionRange(position, position);
          } catch {
            // ignore selection errors
          }
        }
      }
    },
    [closeMention, content, mentionState.active, mentionState.start],
  );

  const handleSelectionChange = useCallback(() => {
    const node = textareaRef.current;
    if (!node) return;
    updateMentionState(node.value, node.selectionStart ?? node.value.length);
  }, [updateMentionState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
      content,
      open: composerOpen,
      mode: composerMode,
      targetId: composerTarget?.id ?? null,
    };
    if (!payload.content && !payload.open && !payload.targetId && payload.mode === "new") {
      window.localStorage.removeItem(COMPOSER_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(COMPOSER_STORAGE_KEY, JSON.stringify(payload));
  }, [composerMode, composerOpen, composerTarget, content]);

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
    posts.forEach((post) => {
      uniquePubkeys.add(post.pubkey);
      post.tags.forEach((tag) => {
        if (Array.isArray(tag) && tag[0] === "p" && typeof tag[1] === "string" && tag[1].trim().length > 0) {
          uniquePubkeys.add(tag[1]);
        }
      });
    });
    uniquePubkeys.forEach((pubkey) => {
      requestProfile(pubkey).catch(() => undefined);
    });
  }, [posts, requestProfile]);

  useEffect(() => {
    if (!translationEnabled) return;
    posts.forEach((post) => {
      ensureTranslation(`feed:${post.id}`, post.content);
    });
  }, [ensureTranslation, posts, translationEnabled]);

  useEffect(() => {
    if (!openPostMenuId) return;
    if (typeof document === "undefined") return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setOpenPostMenuId(null);
        return;
      }
      const container = target.closest<HTMLElement>("[data-post-menu-root]");
      if (!container || container.dataset.postMenuRoot !== openPostMenuId) {
        setOpenPostMenuId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPostMenuId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPostMenuId]);

  const resetComposer = useCallback(() => {
    setComposerOpen(false);
    setComposerTarget(null);
    setComposerMode("new");
    setContent("");
    setComposerError(null);
    setUploadedImages([]);
    setUploadError(null);
    setIsUploading(false);
    setLightboxImage(null);
    setMentionState({ active: false, start: 0, query: "" });
    persistedComposerTargetIdRef.current = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(COMPOSER_STORAGE_KEY);
    }
    setComposerFocused(false);
  }, []);

  const clearComposerTarget = useCallback(() => {
    setComposerTarget(null);
    setComposerMode("new");
    persistedComposerTargetIdRef.current = null;
  }, [setComposerMode, setComposerTarget]);

  const openComposerDialog = useMemo(
    () =>
      createOpenComposerDialog({
        setComposerMode,
        setComposerTarget,
        setContent,
        setComposerError,
        setComposerOpen,
      }),
    [setComposerMode, setComposerTarget, setContent, setComposerError, setComposerOpen],
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

  useEffect(
    () => () => {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    },
    [],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!ready || publishing || isUploading) return;
      const normalizedContent = rewriteImgBbUrlsInText(content, { absolute: true });
      if (normalizedContent !== content) {
        setContent(normalizedContent);
      }
      const trimmed = normalizedContent.trim();
      const attachments = uploadedImages
        .filter((image) => image.size > 0 && image.url)
        .map((image) => ({
          url: image.url,
          mimeType: image.mimeType,
          size: image.size,
          width: image.width,
          height: image.height,
          digest: image.digest,
        }));

      if (trimmed.length === 0 && attachments.length === 0) {
        setComposerError("Add a message to post");
        return;
      }
      if (trimmed.length > 500) {
        setComposerError("Status updates cannot exceed 500 characters");
        return;
      }

      try {
        setComposerError(null);
        setUploadError(null);
        const mentionSelections = collectMentionSelections(trimmed, composerMentionTargets);
        await publishStatus({
          content: trimmed,
          context: composerTarget ? { type: composerMode, post: composerTarget } : undefined,
          attachments,
          mentionPubkeys: mentionSelections.map((selection) => selection.pubkey),
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
    [
      composerMode,
      composerTarget,
      content,
      composerMentionTargets,
      isUploading,
      publishStatus,
      publishing,
      ready,
      resetComposer,
      uploadedImages,
    ],
  );

  const handleUploadClick = useCallback(() => {
    if (!ready || publishing || isUploading) return;
    fileInputRef.current?.click();
  }, [isUploading, publishing, ready]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      event.target.value = "";
      if (!ready || publishing || isUploading) {
        return;
      }
      setUploadError(null);
      const validationMessage = validateImageFile(file);
      if (validationMessage) {
        setUploadError(validationMessage);
        return;
      }

      setIsUploading(true);
      try {
        const uploaded = await uploadImageViaWorker(file);
        setUploadedImages((prev) => {
          const filtered = prev.filter((image) => image.url !== uploaded.url);
          return [...filtered, uploaded];
        });
        setContent((prev) => {
          const normalizedPrev = rewriteImgBbUrlsInText(prev, { absolute: true });
          const prefix =
            normalizedPrev.trim().length === 0
              ? ""
              : normalizedPrev.endsWith("\n")
                ? ""
                : "\n";
          return `${normalizedPrev}${prefix}![Uploaded image](${uploaded.url})\n`;
        });
        setComposerError(null);

        const focusTextarea = () => {
          const node = textareaRef.current;
          if (!node) return;
          const length = node.value.length;
          node.focus();
          try {
            node.setSelectionRange(length, length);
          } catch {
            // Ignore selection errors
          }
        };
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(focusTextarea);
        } else {
          focusTextarea();
        }
        setComposerFocused(true);
      } catch (uploadErr) {
        const message = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        setUploadError(message);
      } finally {
        setIsUploading(false);
      }
    },
    [isUploading, publishing, ready],
  );

  const handleRemoveImage = useCallback(
    (url: string) => {
      setUploadedImages((prev) => prev.filter((image) => image.url !== url));
      setContent((prev) => {
        const lines = prev.split("\n");
        const filtered = lines.filter((line) => {
          const trimmed = line.trim();
          if (!trimmed.includes(url)) {
            return true;
          }
          const match = trimmed.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
          return match?.[1] !== url;
        });
        let next = filtered.join("\n");
        next = next.replace(/\n{3,}/g, "\n\n");
        if (next.trim().length === 0) {
          return "";
        }
        if (!next.endsWith("\n")) {
          next += "\n";
        }
        return next;
      });
    },
    [],
  );

  const filteredPosts = useMemo(() => {
    if (!activeFilter) return posts;
    switch (activeFilter.type) {
      case "tag": {
        const target = activeFilter.value.toLowerCase();
        return posts.filter((post) =>
          post.tags.some((tag) => tag[0] === "t" && tag[1]?.toLowerCase() === target) ||
          post.content.toLowerCase().includes(`#${target}`),
        );
      }
      case "mention": {
        const targetPubkey = activeFilter.pubkey.toLowerCase();
        const normalizedLabel = normalizeMentionLabel(activeFilter.label);
        return posts.filter((post) => {
          const content = post.content.toLowerCase();
          const matchesPubkey =
            post.pubkey.toLowerCase() === targetPubkey ||
            post.tags.some((tag) => tag[0] === "p" && tag[1]?.toLowerCase() === targetPubkey) ||
            content.includes(`@${targetPubkey}`);
          const matchesLabel = normalizedLabel ? content.includes(`@${normalizedLabel}`) : false;
          return matchesPubkey || matchesLabel;
        });
      }
      case "media":
        return posts.filter((post) => post.attachments.length > 0);
      case "mine": {
        if (!pubkey) return [];
        const current = pubkey.toLowerCase();
        return posts.filter((post) => post.pubkey.toLowerCase() === current);
      }
      case "mentions": {
        if (!pubkey) return [];
        const current = pubkey.toLowerCase();
        return posts.filter((post) => {
          const content = post.content.toLowerCase();
          const directMention = content.includes(`@${current}`);
          const tagMention = post.tags.some((tag) => tag[0] === "p" && tag[1]?.toLowerCase() === current);
          return directMention || tagMention;
        });
      }
      default:
        return posts;
    }
  }, [activeFilter, posts, pubkey]);

  const postsById = useMemo(() => {
    const map = new Map<string, FeedPost>();
    posts.forEach((post) => {
      map.set(post.id, post);
    });
    return map;
  }, [posts]);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const activeThreadPost = useMemo(() => {
    if (!activeThreadId) return null;
    return postsById.get(activeThreadId) ?? null;
  }, [activeThreadId, postsById]);

  const threadReplies = useMemo(() => {
    if (!activeThreadId) return [] as FeedPost[];
    return posts
      .filter((post) => post.id !== activeThreadId && referencesPost(post, activeThreadId))
      .sort((a, b) => a.created_at - b.created_at);
  }, [activeThreadId, posts]);

  useEffect(() => {
    if (!activeThreadId) return;
    if (!postsById.has(activeThreadId)) {
      setActiveThreadId(null);
    }
  }, [activeThreadId, postsById]);

  useEffect(() => {
    if (!initialThreadId) {
      setActiveThreadId((current) => (current !== null ? null : current));
      if (activeThreadId !== null) {
        setHighlightedPostId((current) => (current !== null ? null : current));
      }
      lastThreadLoadAttemptRef.current = null;
      return;
    }

    if (postsById.has(initialThreadId)) {
      setActiveThreadId((current) => {
        if (current === initialThreadId) {
          return current;
        }
        setHighlightedPostId(initialThreadId);
        return initialThreadId;
      });
      lastThreadLoadAttemptRef.current = null;
      return;
    }

    if (hasMore && !loadingMore) {
      const nowMs = Date.now();
      const lastAttempt = lastThreadLoadAttemptRef.current;
      if (lastAttempt && lastAttempt.id === initialThreadId && nowMs - lastAttempt.timestamp < 5000) {
        return;
      }
      lastThreadLoadAttemptRef.current = { id: initialThreadId, timestamp: nowMs };
      void loadMore().catch((error) => {
        console.warn("Failed to load more posts while resolving a shared post", error);
      });
    }
  }, [initialThreadId, postsById, hasMore, loadingMore, loadMore, activeThreadId]);

  useEffect(() => {
    if (!initialThreadId) {
      unresolvedThreadRef.current = null;
      return;
    }

    if (postsById.has(initialThreadId)) {
      unresolvedThreadRef.current = null;
      return;
    }

    if (!hasMore && !loadingMore && unresolvedThreadRef.current !== initialThreadId) {
      unresolvedThreadRef.current = initialThreadId;
      showToast("We couldn't find that post. It may have been removed.", { tone: "error" });
    }
  }, [initialThreadId, postsById, hasMore, loadingMore, showToast]);

  const filterLabel = useMemo(() => {
    if (!activeFilter) return null;
    switch (activeFilter.type) {
      case "tag":
        return `Filtering by #${activeFilter.value}`;
      case "mention":
        return `Filtering by @${
          activeFilter.label?.trim().length
            ? activeFilter.label.trim()
            : shortenPubkey(activeFilter.pubkey)
        }`;
      case "media":
        return "Showing posts with media attachments";
      case "mine":
        return "Showing only your posts";
      case "mentions":
        return "Showing posts that mention you";
      default:
        return null;
    }
  }, [activeFilter, shortenPubkey]);

  const clearFilter = useCallback(() => setActiveFilter(null), []);

  const setQuickFilter = useCallback((type: QuickFilterType) => {
    setActiveFilter((prev) => {
      if (prev?.type === type) {
        return null;
      }
      if (type === "media") {
        return { type: "media" };
      }
      if (type === "mine") {
        return { type: "mine" };
      }
      return { type: "mentions" };
    });
  }, []);

  const quickFilterOptions = useMemo(
    () => [
      { type: "media" as const, label: "Media" },
      { type: "mentions" as const, label: "Mentions", disabled: !pubkey },
      { type: "mine" as const, label: "My posts", disabled: !pubkey },
    ],
    [pubkey],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const openThread = useCallback(
    (post: FeedPost) => {
      setActiveThreadId(post.id);
      setHighlightedPostId(post.id);
      if (onThreadChange) {
        onThreadChange(post.id);
      }
    },
    [onThreadChange],
  );

  const closeThread = useCallback(() => {
    setActiveThreadId(null);
    setHighlightedPostId(null);
    if (onThreadChange) {
      onThreadChange(null);
    }
  }, [onThreadChange]);

  const registerPost = useCallback(
    (id: string) => (node: HTMLDivElement | null) => {
      if (!node) {
        postRefs.current.delete(id);
        return;
      }
      postRefs.current.set(id, node);
    },
    [],
  );

  const focusPost = useCallback(
    (id: string) => {
      const container = scrollContainerRef.current;
      const node = postRefs.current.get(id);
      if (!container || !node) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const targetScrollTop =
        nodeRect.top - containerRect.top + container.scrollTop - container.clientHeight / 2 + node.offsetHeight / 2;
      container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: "smooth" });
      setHighlightedPostId(id);
      if (typeof window !== "undefined") {
        if (highlightTimerRef.current) {
          window.clearTimeout(highlightTimerRef.current);
        }
        highlightTimerRef.current = window.setTimeout(() => {
          setHighlightedPostId((current) => (current === id ? null : current));
          highlightTimerRef.current = null;
        }, 2000);
      }
    },
    [setHighlightedPostId],
  );

  const handleJumpToNewPosts = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (filteredPosts[0]) {
      latestKnownPostRef.current = filteredPosts[0].id;
    }
    setShowNewPostsToast(false);
  }, [filteredPosts]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const nearTop = container.scrollTop <= 48;
      setIsAtTop(nearTop);
      if (nearTop && filteredPosts[0]) {
        latestKnownPostRef.current = filteredPosts[0].id;
        setShowNewPostsToast(false);
      }
    };
    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [filteredPosts]);

  useEffect(() => {
    if (filteredPosts.length === 0) {
      latestKnownPostRef.current = null;
      setShowNewPostsToast(false);
      return;
    }
    const newestId = filteredPosts[0].id;
    if (!latestKnownPostRef.current) {
      latestKnownPostRef.current = newestId;
      return;
    }
    if (latestKnownPostRef.current !== newestId) {
      if (isAtTop) {
        latestKnownPostRef.current = newestId;
        setShowNewPostsToast(false);
      } else {
        latestKnownPostRef.current = newestId;
        setShowNewPostsToast(true);
      }
    }
  }, [filteredPosts, isAtTop]);

  useEffect(() => {
    setShowNewPostsToast(false);
  }, [activeFilter]);

  const handleTagClick = useCallback((tag: string) => {
    setActiveFilter({ type: "tag", value: tag.toLowerCase() });
  }, []);

  const handleMentionClick = useCallback(
    (pubkey: string, label: string) => {
      const normalizedPubkey = pubkey.trim().toLowerCase();
      if (!normalizedPubkey) return;
      openProfile(pubkey);
      setActiveFilter({
        type: "mention",
        pubkey: normalizedPubkey,
        label: label?.trim().length ? label.trim() : shortenPubkey(normalizedPubkey),
      });
    },
    [openProfile, shortenPubkey],
  );

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

  const { handlePost, handleReply, handleLike } = useMemo(
    () =>
      createFeedActionHandlers({
        openComposerDialog,
        likePost,
        updatePending,
        setPendingLikes,
      }),
    [likePost, openComposerDialog, updatePending],
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

  const composerTimestampLabel = composerTarget
    ? formatAbsoluteTimestamp(composerTarget.created_at)
    : null;
  const composerPreviewSnippet = composerTarget ? buildPostSnippet(composerTarget.content) : "";
  const composerTargetSummary = composerTarget ? resolveProfileSummary(composerTarget.pubkey) : null;
  const composerReferenceLabel =
    composerMode === "quote" ? "Quoting" : composerMode === "reply" ? "Replying to" : "Referencing";

  const handleComposerReferenceClick = useCallback(() => {
    if (!composerTarget) {
      return;
    }
    focusPost(composerTarget.id);
  }, [composerTarget, focusPost]);

  const handleThreadReply = useCallback(() => {
    if (!activeThreadPost) return;
    handleReply(activeThreadPost);
  }, [activeThreadPost, handleReply]);

  const handleSharePost = useCallback(
    async (post: FeedPost) => {
      if (typeof window === "undefined") {
        return;
      }

      const shareUrl = `${window.location.origin}/community/forum/${post.id}`;
      const attemptFallbackCopy = () => {
        if (typeof window === "undefined") {
          return false;
        }
        const result = window.prompt("Copy this post link", shareUrl);
        if (result !== null) {
          showToast("Post link ready to share", { tone: "success" });
          return true;
        }
        return false;
      };

      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareUrl);
          showToast("Post link copied to clipboard", { tone: "success" });
          return;
        }
      } catch (error) {
        console.warn("Failed to copy post link", error);
        if (attemptFallbackCopy()) {
          return;
        }
        showToast("Copy the link manually to share this post.", { tone: "error" });
        return;
      }

      if (!attemptFallbackCopy()) {
        showToast("Copy the link manually to share this post.", { tone: "info" });
      }
    },
    [showToast],
  );

  const toggleEventDetails = useCallback((postId: string) => {
    setExpandedEventDetails((previous) => {
      const next = new Set(previous);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }, []);

  const handleDeletePost = useCallback(
    async (post: FeedPost) => {
      if (!canModerate) {
        showToast("Only admins can delete posts.", { tone: "error" });
        return;
      }
      if (typeof window !== "undefined") {
        const confirmed = window.confirm("Delete this post from all feeds?");
        if (!confirmed) {
          return;
        }
      }
      updatePending(setPendingDeletes, post.id, true);
      try {
        await deletePost(post);
      } catch (deleteError) {
        console.warn("Unable to delete post", deleteError);
        if (typeof window !== "undefined") {
          const message =
            deleteError instanceof Error ? deleteError.message : "We couldn't delete this post.";
          window.alert(`Delete failed: ${message}`);
        }
      } finally {
        updatePending(setPendingDeletes, post.id, false);
      }
    },
    [canModerate, deletePost, setPendingDeletes, showToast, updatePending],
  );

  const isThreadComposer =
    composerOpen &&
    composerMode === "reply" &&
    composerTarget &&
    activeThreadPost &&
    composerTarget.id === activeThreadPost.id;

  useEffect(() => {
    if (!composerOpen) {
      setComposerFocused(false);
    }
  }, [composerOpen]);

  useEffect(() => {
    const urls = extractMarkdownImageUrls(content);
    setUploadedImages((prev) => {
      const map = new Map(prev.map((image) => [image.url, image]));
      const next = urls.map((url) => map.get(url) ?? createPlaceholderImageDetails(url));
      if (next.length === prev.length && next.every((entry, index) => entry === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [content]);

  useEffect(() => {
    if (!lightboxImage) return;
    if (typeof document === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxImage(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [lightboxImage]);

  const composerExpanded = composerFocused || content.trim().length > 0 || uploadedImages.length > 0;

  const hasSendableAttachments = useMemo(
    () => uploadedImages.some((image) => image.size > 0),
    [uploadedImages],
  );
  const submitDisabled =
    !ready || publishing || isUploading || (content.trim().length === 0 && !hasSendableAttachments);

  const composerContent = (
    <>
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold uppercase tracking-[0.18em] text-[var(--fg-default)]">{composerTitle}</h2>
        <button
          type="button"
          onClick={resetComposer}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          aria-label="Close composer"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {composerTarget && (
        <div className="mt-4 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-3 text-xs text-brand shadow-sm">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={handleComposerReferenceClick}
              className="flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <p className="font-semibold uppercase tracking-[0.24em] text-brand/80">
                {composerReferenceLabel}{" "}
                {composerTargetSummary?.displayName ?? shortenPubkey(composerTarget.pubkey)}
              </p>
              <p className="mt-1 line-clamp-3 text-[11px] font-medium text-brand/90">
                {composerPreviewSnippet || "Referenced post"}
              </p>
              {composerTimestampLabel && (
                <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-brand/60">{composerTimestampLabel}</p>
              )}
            </button>
            <button
              type="button"
              onClick={clearComposerTarget}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand/40 text-brand transition hover:bg-brand hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
              aria-label="Remove referenced post"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(event) => {
              const normalized = rewriteImgBbUrlsInText(event.target.value, { absolute: true });
              setContent(normalized.slice(0, 500));
              const caret = event.target.selectionStart ?? normalized.length;
              updateMentionState(normalized, caret);
            }}
            onKeyDown={(event) => {
              if (mentionDropdownVisible && filteredMentionTargets.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlightedMentionIndex((current) => (current + 1) % filteredMentionTargets.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlightedMentionIndex((current) =>
                    current === 0 ? filteredMentionTargets.length - 1 : current - 1,
                  );
                  return;
                }
                if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
                  event.preventDefault();
                  const choice =
                    filteredMentionTargets[highlightedMentionIndex] ?? filteredMentionTargets[0];
                  if (choice) {
                    applyMention(choice);
                  }
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeMention();
                  return;
                }
              }
              if (event.key === "Escape" && mentionState.active) {
                closeMention();
              }
            }}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => {
              if (content.trim().length === 0) {
                setComposerFocused(false);
              }
              closeMention();
            }}
            onSelect={handleSelectionChange}
            onKeyUp={handleSelectionChange}
            onClick={handleSelectionChange}
            rows={composerExpanded ? 6 : 1}
            className={`w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-4 py-3 text-sm leading-relaxed text-[var(--fg-default)] shadow-inner focus:border-brand focus:outline-none ${composerExpanded ? "resize-y" : "resize-none"}`}
            placeholder={
              composerMode === "reply"
                ? "Share your thoughts…"
                : composerMode === "quote"
                  ? "Add your perspective…"
                  : "What’s happening in your corner of BitcoinSquare?"
            }
            disabled={!ready || publishing}
          />
          {mentionDropdownVisible && (
            <div className="pointer-events-auto absolute left-4 right-4 bottom-4 z-20 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 shadow-xl">
              <ul className="max-h-56 overflow-y-auto py-2" role="listbox" aria-label="Mention suggestions">
                {filteredMentionTargets.map((target, index) => {
                  const isActive = index === highlightedMentionIndex;
                  return (
                    <li key={target.pubkey}>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyMention(target);
                        }}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition ${
                          isActive
                            ? "bg-brand/10 text-brand"
                            : "text-[var(--fg-default)] hover:bg-[var(--bg-muted)]/60"
                        }`}
                        role="option"
                        aria-selected={isActive}
                      >
                        <img src={target.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                        <div className="min-w-0">
                          <p className={`truncate font-semibold ${isActive ? "text-brand" : "text-[var(--fg-default)]"}`}>
                            {target.displayName}
                          </p>
                          <p className="truncate text-xs text-[var(--fg-muted)]">
                            @{target.screenName || target.displayName}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        {uploadedImages.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              {uploadedImages.map((image) => (
                <div
                  key={image.digest ?? image.url}
                  className="group relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70"
                >
                  <button
                    type="button"
                    onClick={() => setLightboxImage({ src: image.url, alt: "Uploaded image preview" })}
                    className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <img
                      src={image.url}
                      alt="Uploaded image preview"
                      className="h-28 w-28 object-cover sm:h-32 sm:w-32"
                      loading="lazy"
                    />
                    <span className="sr-only">View full image</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(image.url)}
                    className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    aria-label="Remove image"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--fg-muted)]">
          <span>{content.length}/500</span>
          {isUploading && (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              <span>Uploading image…</span>
            </span>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={!ready || publishing || isUploading}
            className="inline-flex items-center justify-center rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--fg-muted)] transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
            <span className="ml-2 hidden sm:inline">Add image</span>
          </button>
          <button
            type="submit"
            disabled={submitDisabled}
            className="w-full rounded-full bg-brand px-6 py-2 text-sm font-semibold uppercase tracking-[0.24em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-brand/40 sm:w-auto"
          >
            {submitLabel}
          </button>
        </div>
        {composerError && <p className="text-xs text-red-500">{composerError}</p>}
        {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
        {error && <p className="text-center text-xs text-red-500">{error}</p>}
      </form>
    </>
  );

  const renderPostCard = (
    post: FeedPost,
    {
      variant = "list",
      registerNode,
      highlight = false,
      onOpenThread,
      suppressReferencePreview = false,
    }: {
      variant?: "list" | "thread";
      registerNode?: (node: HTMLDivElement | null) => void;
      highlight?: boolean;
      onOpenThread?: (post: FeedPost) => void;
      suppressReferencePreview?: boolean;
    } = {},
  ) => {
    const isPendingLike = pendingLikes.has(post.id);
    const likeDisabled = !ready || isPendingLike;
    const isPendingDelete = pendingDeletes.has(post.id);
    const canDelete = canModerate;
    const deleteDisabled = !ready || isPendingDelete;
    const statusLabel =
      post.status === "pending"
        ? "Posting to relays…"
        : post.status === "failed"
          ? post.error ?? "Delivery failed."
          : null;
    const translationKey = `feed:${post.id}`;
    const translationEntry = translationEnabled ? getTranslation(translationKey) : undefined;
    const translationStatus = translationEntry?.status ?? "idle";
    const rawTranslatedText =
      translationEntry?.translatedText && translationEntry.translatedText.trim().length > 0
        ? translationEntry.translatedText
        : null;
    const translationReady = translationEnabled && translationStatus === "ready" && !!rawTranslatedText;
    const showOriginal = !translationEnabled || !translationReady || isOriginalVisible(translationKey);
    const contentSource = !showOriginal && rawTranslatedText ? rawTranslatedText : post.content;
    const longPost = isLongPost(contentSource);
    const isThreadVariant = variant === "thread";
    const isExpanded = isThreadVariant || expandedPosts.has(post.id);
    const displayContent = isExpanded || !longPost ? contentSource : getCollapsedContent(contentSource);
    const detectedLanguageLabel =
      translationEntry?.detectedLanguage && translationEntry.detectedLanguage.trim().length > 0
        ? formatLanguageName(translationEntry.detectedLanguage)
        : null;
    const reference = extractPostReference(post.tags);
    const referencedId = reference?.id ?? null;
    const referencedPost = referencedId ? postsById.get(referencedId) : undefined;
    const referencedPubkeyTag = post.tags.find(
      (tag) => Array.isArray(tag) && tag[0] === "p" && typeof tag[1] === "string" && tag[1].trim().length > 0,
    );
    const referencedPubkey =
      referencedPost?.pubkey ?? (referencedPubkeyTag && typeof referencedPubkeyTag[1] === "string" ? referencedPubkeyTag[1] : null);
    const referenceSummary = referencedPubkey ? resolveProfileSummary(referencedPubkey) : null;
    const referenceSnippet =
      referencedPost?.content && referencedPost.content.trim().length > 0
        ? buildPostSnippet(referencedPost.content)
        : "Referenced post";
    const referenceTimestamp =
      referencedPost?.created_at ? formatAbsoluteTimestamp(referencedPost.created_at) : null;
    const showReferencePreview =
      !!reference && !!referencedId && !suppressReferencePreview;
    const interactive = typeof onOpenThread === "function" && (variant === "list" || variant === "thread");
    const cardClassName = `rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm transition ${
      interactive ? "hover:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 cursor-pointer" : ""
    } ${highlight ? "ring-2 ring-brand/60" : ""}`;
    const showEventDetails = expandedEventDetails.has(post.id);
    const eventDetailsLabel = showEventDetails ? "Hide event data" : "View event data";
    const isMenuOpen = openPostMenuId === post.id;

    return (
      <article
        key={post.id}
        ref={registerNode}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={interactive ? () => onOpenThread?.(post) : undefined}
        onKeyDown={
          interactive
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenThread?.(post);
                }
              }
            : undefined
        }
        className={cardClassName}
        title={interactive ? "View conversation" : undefined}
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <ProfileCard
            pubkey={post.pubkey}
            contentClassName="items-start lg:w-1/4"
            className="flex-1 lg:flex-none lg:w-1/4"
            subtitle={shortenPubkey(post.pubkey)}
            meta={
              <span className="text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                {formatRelativeTime(post.created_at)}
              </span>
            }
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openProfile(post.pubkey);
            }}
          />
        </header>

        {showReferencePreview && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              focusPost(referencedId);
            }}
            className="mt-4 w-full rounded-2xl border border-brand/30 bg-brand/10 px-4 py-3 text-left text-xs text-brand transition hover:border-brand/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <p className="font-semibold uppercase tracking-[0.24em] text-brand/80">
              {reference.type === "quote" ? "Quoted post" : "Replying to"}{" "}
              {referenceSummary?.displayName ?? (referencedPubkey ? shortenPubkey(referencedPubkey) : "Community member")}
            </p>
            <p className="mt-1 line-clamp-3 text-[11px] font-medium text-brand/90">{referenceSnippet}</p>
            {referenceTimestamp && (
              <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-brand/60">{referenceTimestamp}</p>
            )}
          </button>
        )}

        <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--fg-default)]">
          {renderContent(displayContent, handleTagClick, resolveMention, handleMentionClick)}
        </div>

        {translationEnabled && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[var(--fg-muted)]">
            {translationStatus === "loading" ? (
              <span>Translating…</span>
            ) : translationStatus === "error" ? (
              <>
                <span>Translation unavailable</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    refreshTranslation(translationKey, post.content);
                  }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-brand transition hover:text-brand/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/60"
                >
                  Retry
                </button>
              </>
            ) : translationReady ? (
              <>
                <span>
                  {showOriginal
                    ? `Showing original${detectedLanguageLabel ? ` (${detectedLanguageLabel})` : ""}`
                    : `Translated from ${detectedLanguageLabel ?? "original language"}`}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleOriginal(translationKey);
                  }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-brand transition hover:text-brand/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/60"
                >
                  {showOriginal ? "View translation" : "View original"}
                </button>
              </>
            ) : null}
          </div>
        )}

        {!isThreadVariant && longPost && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleExpanded(post.id);
            }}
            className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand transition hover:text-brand/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            {isExpanded ? "Show less" : "Show more"}
          </button>
        )}

        {post.attachments.length > 0 && (
          <div className="mt-4 space-y-3">
            {post.attachments.map((attachment, index) => {
              const safeAttachmentUrl = rewriteImgBbUrlToProxy(attachment.url, { absolute: true });
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
                  onClick={(event) => event.stopPropagation()}
                >
                  {attachment.mimeType.startsWith("video/") ? (
                    <video src={safeAttachmentUrl} controls className="max-h-80 w-full rounded-2xl" />
                  ) : (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setLightboxImage({ src: safeAttachmentUrl, alt: "Feed attachment" });
                      }}
                      className="group relative block w-full overflow-hidden"
                    >
                      <img
                        src={safeAttachmentUrl}
                        alt="Feed attachment"
                        className="h-full w-full max-h-64 object-cover transition duration-200 group-hover:scale-[1.01]"
                        loading="lazy"
                      />
                      <span className="sr-only">View full image</span>
                    </button>
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
            onClick={(event) => {
              event.stopPropagation();
              handleLike(post);
            }}
            disabled={likeDisabled}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
              isPendingLike
                ? "border-brand text-brand"
                : "border-[var(--border-subtle)] text-[var(--fg-muted)] hover:border-brand hover:text-brand"
            } disabled:cursor-not-allowed disabled:opacity-60`}
            title={isPendingLike ? "Sending like…" : "Like this post"}
          >
            {isPendingLike ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
            <span className="sr-only">Like</span>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleSharePost(post);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            title="Copy link to post"
          >
            <Share2 className="h-4 w-4" />
            <span className="sr-only">Share</span>
          </button>
          <div className="relative" data-post-menu-root={post.id}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setOpenPostMenuId((current) => (current === post.id ? null : post.id));
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] text-lg font-semibold text-[var(--fg-muted)] transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
              aria-label="Post options"
              title="Post options"
            >
              ...
            </button>
            {isMenuOpen && (
              <div
                role="menu"
                className="absolute left-full top-full z-20 ml-2 mt-2 w-48 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-1 text-sm shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleEventDetails(post.id);
                    setOpenPostMenuId(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[var(--fg-muted)] transition hover:bg-[var(--bg-muted)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                >
                  {eventDetailsLabel}
                </button>
                {canDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={deleteDisabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenPostMenuId(null);
                      if (deleteDisabled) {
                        return;
                      }
                      void handleDeletePost(post);
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                      deleteDisabled
                        ? "cursor-not-allowed text-[var(--fg-muted)]/60"
                        : "text-red-500 hover:bg-red-500/10"
                    }`}
                  >
                    {isPendingDelete ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    <span>Delete post</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {showEventDetails && (
          <div className="mt-4 space-y-2 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-xs text-[var(--fg-muted)]">
            <p className="font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]">Raw event</p>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-[var(--bg-card)]/70 p-3 text-[11px] leading-relaxed text-[var(--fg-muted)]">
              {JSON.stringify(post.event, null, 2)}
            </pre>
          </div>
        )}

      </article>
    );
  };

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-4 py-3 text-xs sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Quick filters:</span>
            {quickFilterOptions.map(({ type, label, disabled }) => {
              const isActive = activeFilter?.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setQuickFilter(type)}
                  disabled={disabled}
                  className={`rounded-full border px-3 py-1 font-medium transition disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                    isActive
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-[var(--border-subtle)] text-[var(--fg-muted)] hover:border-brand hover:text-brand"
                  } ${disabled ? "opacity-50" : ""}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {activeFilter && filterLabel && (
            <div className="flex flex-wrap items-center gap-2 text-[var(--fg-muted)]">
              <span>{filterLabel}</span>
              <button
                type="button"
                onClick={clearFilter}
                className="rounded-full border border-[var(--border-subtle)] px-3 py-1 font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
              >
                Clear filter
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-4 py-6 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pb-32"
      >
        <ErrorBoundary
          fallback={
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">
              We couldn&apos;t render the community feed right now. Please refresh the page.
            </div>
          }
        >
          {!ready && (
            <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-muted)]">
              We generate a local signing key automatically to publish updates. Once it is ready you can post to the feed instantly.
            </div>
          )}

          {composerOpen && composerMode !== "reply" && (
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/90 p-5 shadow-sm">
              {composerContent}
            </div>
          )}

          {error && !composerOpen && (
            <p className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500">{error}</p>
          )}

          {initialLoading && posts.length === 0 ? null : filteredPosts.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">
              No posts yet{activeFilter ? " for this filter." : "."} Be the first to share what you’re working on!
            </p>
          ) : (
            filteredPosts.map((post) =>
              renderPostCard(post, {
                variant: "list",
                registerNode: registerPost(post.id),
                highlight: highlightedPostId === post.id,
                onOpenThread: openThread,
              }),
            )
          )}

        {initialLoading && posts.length === 0 && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`feed-skeleton-${index}`}
                className="animate-pulse rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-[var(--bg-muted)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 rounded-full bg-[var(--bg-muted)]" />
                    <div className="h-2 w-1/2 rounded-full bg-[var(--bg-muted)]" />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-2 w-full rounded-full bg-[var(--bg-muted)]" />
                  <div className="h-2 w-4/5 rounded-full bg-[var(--bg-muted)]" />
                  <div className="h-2 w-3/5 rounded-full bg-[var(--bg-muted)]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {loadingMore && (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={`feed-loading-${index}`}
                className="animate-pulse rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm"
              >
                <div className="h-3 w-2/3 rounded-full bg-[var(--bg-muted)]" />
                <div className="mt-2 h-2 w-full rounded-full bg-[var(--bg-muted)]" />
              </div>
            ))}
          </div>
        )}
        <div ref={sentinelRef} />
        {!hasMore && filteredPosts.length > 0 && (
          <p className="text-center text-xs text-[var(--fg-muted)]">You reached the end of the feed.</p>
        )}
        </ErrorBoundary>
      </div>

      {showNewPostsToast && (
        <button
          type="button"
          onClick={handleJumpToNewPosts}
          className="fixed left-1/2 z-40 -translate-x-1/2 rounded-full bg-[var(--bg-card)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand shadow-lg ring-1 ring-brand/40 transition hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 bottom-[calc(7rem+env(safe-area-inset-bottom,0px))] sm:bottom-36"
        >
          New posts available — Jump
        </button>
      )}

      {activeThreadPost && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10 sm:py-16">
          <div className="absolute inset-0" onClick={closeThread} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feed-thread-heading"
            className="relative z-[80] w-full max-w-3xl space-y-6 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-2xl"
          >
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2
                  id="feed-thread-heading"
                  className="text-lg font-semibold uppercase tracking-[0.18em] text-[var(--fg-default)]"
                >
                  Post details
                </h2>
                <p className="mt-1 text-xs uppercase tracking-[0.3em] text-[var(--fg-muted)]">
                  {formatAbsoluteTimestamp(activeThreadPost.created_at) ?? ""}
                </p>
              </div>
              <button
                type="button"
                onClick={closeThread}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                aria-label="Close post details"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {renderPostCard(activeThreadPost, { variant: "thread" })}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)]">Replies</h3>
              <button
                type="button"
                onClick={handleThreadReply}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-brand"
                disabled={!ready}
              >
                <MessageCircle className="h-4 w-4" />
                Reply to post
              </button>
            </div>

            {threadReplies.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-muted)]">
                No replies yet. Share your thoughts to start the conversation.
              </p>
            ) : (
              <div className="space-y-4">
                {threadReplies.map((reply) =>
                  renderPostCard(reply, {
                    variant: "thread",
                    onOpenThread: openThread,
                    suppressReferencePreview: true,
                  }),
                )}
              </div>
            )}

            {isThreadComposer && (
              <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/90 p-5 shadow-sm">
                {composerContent}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handlePost}
        disabled={!ready}
        className="fixed right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-brand disabled:cursor-not-allowed disabled:bg-brand/40 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-24"
        aria-label="Create a new community post"
      >
        <Plus className="h-6 w-6" />
      </button>

      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[90] flex h-screen w-screen items-center justify-center bg-black/90 p-4 sm:p-10"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setLightboxImage(null);
            }}
            className="absolute right-6 top-6 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            aria-label="Close image preview"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <div
            className="flex max-h-full max-w-full items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={lightboxImage.src}
              alt={lightboxImage.alt}
              className="max-h-full max-w-full object-contain"
              loading="lazy"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BitcoinSquareFeed;
