import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { FeedAttachment, FeedPost, PublishContext } from "../../hooks/useBitcoinSquareFeed";
import { searchUsersByScreenName, type ScreenNameUser } from "../../api/users";
import { fallbackProfileAvatar, useProfileIdentity, shortenPubkey } from "../../context/ProfileIdentityContext";
import type { ProfileSummary } from "../../context/ProfileIdentityContext";
import { CASUAL_ROOM_ID, CASUAL_ROOM_NAME } from "../../hooks/useBitcoinSquareCasualChat";
import { useCommunityTranslation } from "../../context/CommunityTranslationContext";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import ProfileCard from "../profile/ProfileCard";
import ErrorBoundary from "../ErrorBoundary";
import type { RoomDefinition } from "../RoomList";
import { Heart, ImagePlus, Loader2, Menu, MessageSquareQuote, Plus, Share2, Trash2, X } from "lucide-react";
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
import type { MentionCandidate } from "../../utils/mentions";
import useMentionAutocomplete from "../../hooks/useMentionAutocomplete";
import {
  arePinnedEntriesEqual,
  loadPinnedEntries,
  persistPinnedEntries,
  type PinnedEntry,
} from "../../utils/pinnedEntries";
import { extractLanguageTag, shouldTranslateForTargetLanguage } from "../../utils/nostrLanguage";

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
  editPost: (post: FeedPost, content: string, attachments?: FeedPost["attachments"]) => Promise<void>;
  likePost: (post: FeedPost) => Promise<void>;
  deletePost: (post: FeedPost) => Promise<void>;
  pinnedEntries: PinnedEntry[];
  onPinPost: (post: FeedPost) => Promise<void>;
  onUnpinPost: (post: FeedPost) => Promise<void>;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  pubkey: string | null;
  initialLoading: boolean;
  initialThreadId?: string | null;
  onThreadChange?: (postId: string | null) => void;
  emptyStateMessage?: React.ReactNode;
  externalComposerRequest?: number | null;
  onComposerOpenChange?: (open: boolean) => void;
}

type ActiveFilter =
  | { type: "tag"; value: string }
  | { type: "mention"; value: string }
  | { type: "media" }
  | { type: "mentions" }
  | { type: "mine" }
  | null;

type QuickFilterType = "media" | "mentions" | "mine";

const LONG_POST_CHAR_THRESHOLD = 320;
const LONG_POST_LINE_THRESHOLD = 6;
const COMPOSER_STORAGE_KEY = "bitcoinsquare-feed-composer-state";
const PINNED_POSTS_STORAGE_KEY = "bitcoinsquare-pinned-posts";

const createRelativeFormatter = () => {
  try {
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  } catch (error) {
    console.warn("Relative time format not supported", error);
    return null;
  }
};

type PinnedPostEntry = PinnedEntry;

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
  editPost,
  likePost,
  deletePost,
  pinnedEntries,
  onPinPost,
  onUnpinPost,
  loadMore,
  loadingMore,
  hasMore,
  error,
  pubkey,
  initialLoading,
  initialThreadId = null,
  onThreadChange,
  emptyStateMessage,
  externalComposerRequest = null,
  onComposerOpenChange,
}) => {
  const [content, setContent] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("new");
  const [composerTarget, setComposerTarget] = useState<FeedPost | null>(null);
  const [cachedPinnedPostEntries, setCachedPinnedPostEntries] = useState<PinnedPostEntry[]>(() =>
    loadPinnedEntries(PINNED_POSTS_STORAGE_KEY),
  );
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);
  const [pendingLikes, setPendingLikes] = useState<PendingMap>(() => new Set());
  const [pendingPins, setPendingPins] = useState<PendingMap>(() => new Set());
  const [pendingDeletes, setPendingDeletes] = useState<PendingMap>(() => new Set());
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(() => new Set());
  const [expandedEventDetails, setExpandedEventDetails] = useState<Set<string>>(() => new Set());
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);
  const [postMenuPosition, setPostMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const closePostMenu = useCallback(() => {
    setOpenPostMenuId(null);
    setPostMenuPosition(null);
  }, []);
  useEffect(() => {
    const limited =
      pinnedEntries.length > 1 ? [pinnedEntries[pinnedEntries.length - 1]] : pinnedEntries;
    setCachedPinnedPostEntries((previous) => {
      if (arePinnedEntriesEqual(previous, limited)) {
        return previous;
      }
      return limited;
    });
  }, [pinnedEntries]);

  useEffect(() => {
    persistPinnedEntries(PINNED_POSTS_STORAGE_KEY, cachedPinnedPostEntries);
  }, [cachedPinnedPostEntries]);
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
  const composerContainerRef = useRef<HTMLDivElement | null>(null);
  const lastExternalComposerRequestRef = useRef<number | null>(null);
  const unresolvedThreadRef = useRef<string | null>(null);
  const lastThreadLoadAttemptRef = useRef<{ id: string; timestamp: number } | null>(null);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImageDetails[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingInProgress, setEditingInProgress] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  const relativeFormatter = useMemo(() => createRelativeFormatter(), []);
  const now = useRelativeNow();
  const { requestProfile, resolveProfileSummary, openProfile, profiles } = useProfileIdentity();
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
    targetLanguage,
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

  const composerStateSnapshot = useCallback(
    () => ({
      mode: composerMode,
      targetId: composerTarget?.id ?? null,
      content,
      attachmentCount: uploadedImages.length,
    }),
    [composerMode, composerTarget, content, uploadedImages.length],
  );

  const mapAttachmentToUploadedImage = useCallback(
    (attachment: FeedAttachment): UploadedImageDetails => {
      const placeholder = createPlaceholderImageDetails(attachment.url);
      return {
        ...placeholder,
        url: rewriteImgBbUrlToProxy(attachment.url, { absolute: true }),
        originalUrl: attachment.url,
        width: attachment.width ?? placeholder.width,
        height: attachment.height ?? placeholder.height,
        size: attachment.size ?? placeholder.size,
        mimeType: attachment.mimeType,
        digest: attachment.digest ?? placeholder.digest,
      };
    },
    [],
  );

  const mapUserToMentionCandidate = useCallback(
    (user: ScreenNameUser): MentionCandidate | null => {
      const screenName = user.screenName.trim();
      const pubkeyValue = user.nostrPubkey?.trim();
      if (!screenName || !pubkeyValue) {
        return null;
      }
      const summary = resolveProfileSummary(pubkeyValue);
      const displayName = summary.displayName?.trim() || `@${screenName}`;
      const avatarUrl =
        summary.avatarUrl ||
        user.avatarUrl ||
        fallbackProfileAvatar(pubkeyValue);
      return {
        pubkey: pubkeyValue,
        displayName,
        screenName,
        avatarUrl,
        shortPubkey: shortenPubkey(pubkeyValue),
      };
    },
    [fallbackProfileAvatar, resolveProfileSummary],
  );

  const localMentionCandidates = useMemo(() => {
    const list: MentionCandidate[] = [];
    const seen = new Set<string>();
    Object.entries(profiles).forEach(([pubkey, entry]) => {
      const screenName = entry.data?.screenName?.trim();
      if (!screenName) {
        return;
      }
      const normalized = screenName.toLowerCase();
      if (seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      const summary = resolveProfileSummary(pubkey);
      const displayName = summary.displayName?.trim() || `@${screenName}`;
      list.push({
        pubkey,
        displayName,
        screenName,
        avatarUrl: summary.avatarUrl || fallbackProfileAvatar(pubkey),
        shortPubkey: shortenPubkey(pubkey),
      });
    });
    list.sort((a, b) => a.screenName.toLowerCase().localeCompare(b.screenName.toLowerCase()));
    return list;
  }, [fallbackProfileAvatar, profiles, resolveProfileSummary, shortenPubkey]);

  const fetchMentionCandidates = useCallback(
    async (query: string, limit: number) => {
      const users = await searchUsersByScreenName(query, limit);
      users.forEach((user) => {
        if (user.nostrPubkey) {
          requestProfile(user.nostrPubkey).catch(() => undefined);
        }
      });
      const mapped = users
        .map((user) => mapUserToMentionCandidate(user))
        .filter((candidate): candidate is MentionCandidate => Boolean(candidate));
      return mapped.slice(0, limit);
    },
    [mapUserToMentionCandidate, requestProfile],
  );

  const {
    mentionActive,
    mentionResults,
    mentionHighlightIndex,
    setMentionHighlightIndex,
    listId: mentionListId,
    activeOptionId: activeMentionOptionId,
    handleKeyDown: handleMentionKeyDown,
    handleMentionSelection,
    updateMentionState,
    closeMention,
  } = useMentionAutocomplete({
    value: content,
    onChange: (next) => setContent(next.slice(0, 500)),
    textareaRef,
    fetchCandidates: fetchMentionCandidates,
    candidates: localMentionCandidates,
    limit: 5,
    listIdPrefix: "feed-composer-mentions",
    onMentionInserted: () => setComposerFocused(true),
  });

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
      if (parsed.mode === "reply" || parsed.mode === "quote" || parsed.mode === "edit") {
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
      const languageTag = extractLanguageTag(post.tags);
      if (shouldTranslateForTargetLanguage(languageTag, targetLanguage)) {
        ensureTranslation(`feed:${post.id}`, post.content);
      }
    });
  }, [ensureTranslation, posts, targetLanguage, translationEnabled]);

  useEffect(() => {
    if (!openPostMenuId) {
      setPostMenuPosition(null);
      return;
    }
    if (typeof document === "undefined") return;

    const updatePosition = () => {
      const trigger = document.querySelector<HTMLElement>(
        `[data-post-menu-trigger="${openPostMenuId}"]`,
      );
      if (!trigger) {
        closePostMenu();
        return;
      }
      const rect = trigger.getBoundingClientRect();
      setPostMenuPosition({
        top: rect.bottom + 8,
        left: rect.right + 8,
      });
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        closePostMenu();
        return;
      }
      if (target.closest("[data-post-menu]")) {
        return;
      }
      const trigger = target.closest<HTMLElement>("[data-post-menu-trigger]");
      if (trigger && trigger.dataset.postMenuTrigger === openPostMenuId) {
        return;
      }
      closePostMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePostMenu();
      }
    };

    updatePosition();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [closePostMenu, openPostMenuId]);

  const handleComposerClose = useCallback(() => {
    setComposerOpen(false);
    setComposerFocused(false);
    setComposerError(null);
    closeMention();
  }, [closeMention]);

  const resetComposer = useCallback(() => {
    handleComposerClose();
    setComposerTarget(null);
    setComposerMode("new");
    setContent("");
    setUploadedImages([]);
    setUploadError(null);
    setIsUploading(false);
    setLightboxImage(null);
    setEditingInProgress(false);
    persistedComposerTargetIdRef.current = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(COMPOSER_STORAGE_KEY);
    }
  }, [handleComposerClose]);

  const clearComposerTarget = useCallback(() => {
    setComposerTarget(null);
    setComposerMode("new");
    persistedComposerTargetIdRef.current = null;
  }, [setComposerMode, setComposerTarget]);

  const handleComposerModeOpen = useCallback(
    (
      mode: ComposerMode,
      target: FeedPost | null,
      { hasExistingDraft }: { hasExistingDraft: boolean },
    ) => {
      if (mode === "edit") {
        if (!target) {
          setUploadedImages([]);
        } else if (!hasExistingDraft) {
          const images = target.attachments
            .filter((attachment) => attachment.mimeType.startsWith("image/"))
            .map((attachment) => mapAttachmentToUploadedImage(attachment));
          setUploadedImages(images);
        }
      } else if (!hasExistingDraft) {
        setUploadedImages([]);
      }
      if (!hasExistingDraft) {
        setUploadError(null);
      }
    },
    [mapAttachmentToUploadedImage, setUploadError],
  );

  const openComposerDialog = useMemo(
    () =>
      createOpenComposerDialog({
        setComposerMode,
        setComposerTarget,
        setContent,
        setComposerError,
        setComposerOpen,
        getCurrentState: composerStateSnapshot,
        shortenPubkey,
        onOpenMode: handleComposerModeOpen,
      }),
    [
      composerStateSnapshot,
      handleComposerModeOpen,
      setComposerError,
      setComposerMode,
      setComposerOpen,
      setComposerTarget,
      setContent,
      shortenPubkey,
    ],
  );

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

  useEffect(() => {
    if (typeof externalComposerRequest !== "number") {
      return;
    }
    if (externalComposerRequest === lastExternalComposerRequestRef.current) {
      return;
    }
    lastExternalComposerRequestRef.current = externalComposerRequest;
    openComposerDialog("new");
  }, [externalComposerRequest, openComposerDialog]);

  useEffect(() => {
    if (!onComposerOpenChange) {
      return;
    }
    onComposerOpenChange(composerOpen && composerMode !== "reply");
  }, [composerMode, composerOpen, onComposerOpenChange]);

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
      if (!ready || publishing || isUploading || editingInProgress) return;
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
        if (composerMode === "edit" && composerTarget) {
          setEditingInProgress(true);
          const attachmentsForEdit =
            attachments.length > 0 ? attachments : composerTarget.attachments ?? [];
          try {
            await editPost(composerTarget, trimmed, attachmentsForEdit);
            resetComposer();
          } catch (editError) {
            setComposerError(
              editError instanceof Error
                ? editError.message
                : "We couldn't update your post just yet.",
            );
          } finally {
            setEditingInProgress(false);
          }
          return;
        }
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
    [
      composerMode,
      composerTarget,
      content,
      editPost,
      editingInProgress,
      isUploading,
      publishStatus,
      publishing,
      ready,
      resetComposer,
      uploadedImages,
    ],
  );

  const handleUploadClick = useCallback(() => {
    if (!ready || publishing || isUploading || editingInProgress) return;
    fileInputRef.current?.click();
  }, [editingInProgress, isUploading, publishing, ready]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      event.target.value = "";
      if (!ready || publishing || isUploading || editingInProgress) {
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
    [editingInProgress, isUploading, publishing, ready],
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
        const target = activeFilter.value.toLowerCase();
        return posts.filter((post) =>
          post.pubkey.toLowerCase() === target ||
          post.tags.some((tag) => tag[0] === "p" && tag[1]?.toLowerCase() === target) ||
          post.content.toLowerCase().includes(`@${target}`),
        );
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

  const visiblePinnedPostEntries = useMemo(() => {
    if (cachedPinnedPostEntries.length === 0) {
      return [] as PinnedPostEntry[];
    }
    const availableIds = new Set(posts.map((post) => post.id));
    return cachedPinnedPostEntries.filter((entry) => availableIds.has(entry.id));
  }, [cachedPinnedPostEntries, posts]);

  const pinnedPostIdSet = useMemo(
    () => new Set(visiblePinnedPostEntries.map((entry) => entry.id)),
    [visiblePinnedPostEntries],
  );

  const displayedPosts = useMemo(() => {
    if (visiblePinnedPostEntries.length === 0 || filteredPosts.length === 0) {
      return filteredPosts;
    }
    const pinned = visiblePinnedPostEntries
      .map((entry) => filteredPosts.find((post) => post.id === entry.id))
      .filter((post): post is FeedPost => Boolean(post));
    if (pinned.length === 0) {
      return filteredPosts;
    }
    const pinnedIds = new Set(pinned.map((post) => post.id));
    const others = filteredPosts.filter((post) => !pinnedIds.has(post.id));
    return [...pinned, ...others];
  }, [filteredPosts, visiblePinnedPostEntries]);

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

  const activeThreadSummary = useMemo(() => {
    if (!activeThreadPost) {
      return null;
    }
    return resolveProfileSummary(activeThreadPost.pubkey);
  }, [activeThreadPost, resolveProfileSummary]);

  const activeThreadHeadingLabel =
    activeThreadSummary?.displayName ??
    activeThreadSummary?.screenName ??
    (activeThreadPost ? shortenPubkey(activeThreadPost.pubkey) : "Thread");

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
        return `Filtering by @${activeFilter.value}`;
      case "media":
        return "Showing posts with media attachments";
      case "mine":
        return "Showing only your posts";
      case "mentions":
        return "Showing posts that mention you";
      default:
        return null;
    }
  }, [activeFilter]);

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

  const handlePinPost = useCallback(
    async (post: FeedPost) => {
      updatePending(setPendingPins, post.id, true);
      try {
        await onPinPost(post);
      } catch (pinError) {
        const message = pinError instanceof Error ? pinError.message : String(pinError);
        setComposerError(message);
      } finally {
        updatePending(setPendingPins, post.id, false);
      }
    },
    [onPinPost, setComposerError, updatePending],
  );

  const handleUnpinPost = useCallback(
    async (post: FeedPost) => {
      updatePending(setPendingPins, post.id, true);
      try {
        await onUnpinPost(post);
      } catch (pinError) {
        const message = pinError instanceof Error ? pinError.message : String(pinError);
        setComposerError(message);
      } finally {
        updatePending(setPendingPins, post.id, false);
      }
    },
    [onUnpinPost, setComposerError, updatePending],
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

  const { handlePost, handleLike, handleEdit: openEditComposer } = useMemo(
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
      ? "Reply"
      : composerMode === "quote"
        ? "Quote note"
        : composerMode === "edit"
          ? "Edit post"
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
        : composerMode === "edit"
          ? editingInProgress
            ? "Saving changes…"
            : "Save changes"
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
    composerMode === "reply" &&
    composerTarget &&
    activeThreadPost &&
    (composerTarget.id === activeThreadPost.id || threadReplies.some((reply) => reply.id === composerTarget.id));

  useEffect(() => {
    if (!activeThreadPost) {
      return;
    }
    if (composerMode === "reply" && composerTarget) {
      if (composerTarget.id === activeThreadPost.id && !composerOpen) {
        setComposerOpen(true);
      }
      return;
    }
    openComposerDialog("reply", activeThreadPost);
  }, [activeThreadPost, composerMode, composerOpen, composerTarget, openComposerDialog, setComposerOpen]);

  useEffect(() => {
    if (!composerOpen) {
      setComposerFocused(false);
    }
  }, [composerOpen]);

  useEffect(() => {
    if (!composerOpen || composerMode === "reply") {
      return;
    }
    if (typeof document === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleComposerClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [composerMode, composerOpen, handleComposerClose]);

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

  const lightboxOverlay =
    lightboxImage
      ? (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4 sm:p-6"
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
            <div className="relative flex max-h-[90vh] max-w-[90vw] items-center justify-center" onClick={(event) => event.stopPropagation()}>
              <img
                src={lightboxImage.src}
                alt={lightboxImage.alt}
                className="h-auto max-h-full w-auto max-w-full object-contain"
                loading="lazy"
              />
            </div>
          </div>
        )
      : null;

  const composerExpanded = composerFocused || content.trim().length > 0 || uploadedImages.length > 0;

  const hasSendableAttachments = useMemo(
    () => uploadedImages.some((image) => image.size > 0),
    [uploadedImages],
  );
  const submitDisabled =
    !ready || publishing || editingInProgress || isUploading || (content.trim().length === 0 && !hasSendableAttachments);

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const handled = handleMentionKeyDown(event);
    if (handled) {
      return;
    }
  };

  const handleComposerChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const normalized = rewriteImgBbUrlsInText(event.target.value, { absolute: true });
    const nextValue = normalized.slice(0, 500);
    setContent(nextValue);
    updateMentionState(nextValue, event.target.selectionStart ?? nextValue.length);
  };

  const handleComposerSelectionChange = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const node = event.currentTarget;
    updateMentionState(node.value, node.selectionStart ?? node.value.length);
  };

  const handleComposerFocus = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    setComposerFocused(true);
    updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length);
  };

  const handleComposerBlur = () => {
    if (content.trim().length === 0) {
      setComposerFocused(false);
    }
    closeMention();
  };

  const mentionDropdownBottom =
    uploadedImages.length > 0 ? "12rem" : composerExpanded ? "7rem" : "5.5rem";

  const isDialogComposer = composerMode !== "reply";

  const composerContent = (
    <div className={`${isDialogComposer ? "flex h-full flex-col" : "flex flex-col"} overflow-hidden`}>
      <header className="flex items-center justify-between gap-3">
        <h2
          id="feed-composer-heading"
          className="text-lg font-semibold uppercase tracking-[0.18em] text-[var(--fg-default)]"
        >
          {composerTitle}
        </h2>
        <button
          type="button"
          onClick={handleComposerClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          aria-label="Close composer"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {composerTarget && (
        <div className="mt-4 text-xs text-[var(--fg-muted)]">
          <button
            type="button"
            onClick={handleComposerReferenceClick}
            className="flex w-full flex-col items-start gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <span className="font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]/80">
              {composerReferenceLabel}{" "}
              {composerTargetSummary?.displayName ?? shortenPubkey(composerTarget.pubkey)}
            </span>
            <span className="line-clamp-3 text-[11px] font-medium text-[var(--fg-muted)]/90">
              {composerPreviewSnippet || "Referenced post"}
            </span>
            {composerTimestampLabel && (
              <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--fg-muted)]/60">{composerTimestampLabel}</span>
            )}
          </button>
          <button
            type="button"
            onClick={clearComposerTarget}
            className="mt-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            aria-label="Remove referenced post"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={`mt-4 flex flex-1 flex-col gap-4 ${isDialogComposer ? "overflow-hidden" : ""}`}
      >
        <div className={`${isDialogComposer ? "flex-1 space-y-4 overflow-y-auto pr-1" : "space-y-4"}`}>
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleComposerChange}
              onKeyDown={handleComposerKeyDown}
              onSelect={handleComposerSelectionChange}
              onClick={handleComposerSelectionChange}
              onFocus={handleComposerFocus}
              onBlur={handleComposerBlur}
              rows={isDialogComposer ? 10 : composerExpanded ? 6 : 1}
              className={`w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-4 py-3 text-sm leading-relaxed text-[var(--fg-default)] shadow-inner focus:border-brand focus:outline-none ${composerExpanded ? "resize-y" : "resize-none"} ${isDialogComposer ? "min-h-[12rem]" : ""}`}
              placeholder={
                composerMode === "reply"
                  ? "Share your thoughts…"
                  : composerMode === "quote"
                    ? "Add your perspective…"
                    : composerMode === "edit"
                      ? "Update your post…"
                      : "What’s happening in your corner of BitcoinSquare?"
              }
              disabled={!ready || publishing || editingInProgress}
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-controls={mentionActive ? mentionListId : undefined}
              aria-expanded={mentionActive}
              aria-activedescendant={activeMentionOptionId}
            />
            {mentionActive && (
              <div
                id={mentionListId}
                role="listbox"
                aria-label="Mention suggestions"
                style={{ bottom: mentionDropdownBottom }}
                className="pointer-events-auto absolute left-4 right-4 z-40 max-h-60 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-xl sm:right-auto sm:w-80"
              >
                {mentionResults.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-[var(--fg-muted)]">No matches found.</p>
                ) : (
                  <ul className="max-h-60 overflow-y-auto py-1">
                    {mentionResults.map((candidate, index) => {
                      const optionId = `${mentionListId}-${candidate.pubkey}`;
                      const isActive = index === mentionHighlightIndex;
                      return (
                        <li key={candidate.pubkey} role="presentation">
                          <button
                            id={optionId}
                            role="option"
                            aria-selected={isActive}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleMentionSelection(candidate)}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                              isActive
                                ? "bg-brand/10 text-brand"
                                : "text-[var(--fg-muted)] hover:bg-[var(--bg-muted)]/60"
                            }`}
                          >
                            <img
                              src={candidate.avatarUrl}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover"
                            />
                            <div className="flex flex-col">
                              <span className="font-semibold text-[var(--fg-default)]">
                                {candidate.displayName}
                              </span>
                              <span className="text-xs text-[var(--fg-muted)]">@{candidate.screenName}</span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
          {uploadedImages.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {uploadedImages.map((image) => (
                <div
                  key={image.url}
                  className="group relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60"
                >
                  <img src={image.url} alt="Uploaded" className="h-full w-full object-cover" loading="lazy" />
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
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--fg-muted)]">
          <span>{content.length}/500</span>
          {(isUploading || editingInProgress) && (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              <span>{isUploading ? "Uploading image…" : "Saving edit…"}</span>
            </span>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={!ready || publishing || isUploading || editingInProgress}
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
    </div>
  );

  const composerDialog =
    composerOpen && composerMode !== "reply"
      ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feed-composer-heading"
            className="fixed inset-0 z-[85] flex flex-col bg-white/80 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-8 dark:bg-white/10 sm:px-6 sm:pt-10"
            onClick={handleComposerClose}
          >
            <div
              ref={composerContainerRef}
              className="pointer-events-auto mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-2xl backdrop-blur"
              onClick={(event) => event.stopPropagation()}
            >
              {composerContent}
            </div>
          </div>
        )
      : null;

  const composerOverlay =
    composerDialog &&
    (typeof document !== "undefined" ? createPortal(composerDialog, document.body) : composerDialog);

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
    const isPinned = pinnedPostIdSet.has(post.id);
    const isPinPending = pendingPins.has(post.id);
    const pinActionDisabled = !ready || isPinPending;
    const statusLabel =
      post.status === "pending"
        ? post.optimistic && post.edited
          ? "Updating post…"
          : "Posting to relays…"
        : post.status === "failed"
          ? post.error ?? "Delivery failed."
          : null;
    const translationKey = `feed:${post.id}`;
    const translationEntry = translationEnabled ? getTranslation(translationKey) : undefined;
    const translationStatus = translationEntry?.status ?? "idle";
    const trimmedTranslatedText = translationEntry?.translatedText?.trim();
    const rawTranslatedText =
      trimmedTranslatedText && trimmedTranslatedText.length > 0
        ? trimmedTranslatedText
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
    const imageAttachments = post.attachments.filter((attachment) =>
      attachment.mimeType.startsWith("image/"),
    );
    const otherAttachments = post.attachments.filter(
      (attachment) => !attachment.mimeType.startsWith("image/"),
    );
    const interactive = typeof onOpenThread === "function" && (variant === "list" || variant === "thread");
    const cardClassName = [
      "community-card",
      interactive ? "community-card--interactive" : "",
      highlight ? "community-card--highlight" : "",
      isPinned ? "community-card--pinned" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const showEventDetails = expandedEventDetails.has(post.id);
    const eventDetailsLabel = showEventDetails ? "Hide event data" : "View event data";
    const isMenuOpen = openPostMenuId === post.id;
    const editedTimestampLabel = post.edited_at ? formatAbsoluteTimestamp(post.edited_at) : null;
    const canEditPost = pubkey ? post.pubkey.toLowerCase() === pubkey.toLowerCase() : false;
    const relativeTimestampLabel = formatRelativeTime(post.created_at);
    const metaLeftItems: { key: string; content: React.ReactNode }[] = [];

    if (translationEnabled) {
      if (translationStatus === "loading") {
        metaLeftItems.push({ key: "translation-status", content: "Translating…" });
      } else if (translationStatus === "error") {
        metaLeftItems.push({ key: "translation-status", content: "Translation unavailable" });
        metaLeftItems.push({
          key: "translation-retry",
          content: (
            <button
              type="button"
              className="community-card__meta-action"
              onClick={(event) => {
                event.stopPropagation();
                refreshTranslation(translationKey, post.content);
              }}
            >
              Retry
            </button>
          ),
        });
      } else if (translationReady) {
        metaLeftItems.push({
          key: "translation-status",
          content: showOriginal
            ? `Showing original${detectedLanguageLabel ? ` (${detectedLanguageLabel})` : ""}`
            : `Translated from ${detectedLanguageLabel ?? "original language"}`,
        });
        metaLeftItems.push({
          key: "translation-toggle",
          content: (
            <button
              type="button"
              className="community-card__meta-action"
              onClick={(event) => {
                event.stopPropagation();
                toggleOriginal(translationKey);
              }}
            >
              {showOriginal ? "View translation" : "View original"}
            </button>
          ),
        });
      }
    }

    metaLeftItems.push({ key: "timestamp", content: relativeTimestampLabel });

    if (post.edited) {
      metaLeftItems.push({
        key: "edited",
        content: (
          <span title={editedTimestampLabel ?? undefined}>Edited</span>
        ),
      });
    }

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
        <header className="community-card__header">
          <ProfileCard
            pubkey={post.pubkey}
            contentClassName="items-center"
            className="w-full community-card__author"
            subtitle={shortenPubkey(post.pubkey)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openProfile(post.pubkey);
            }}
          />
          {isPinned && (
            <div className="community-card__title-row">
              <span className="community-card__pin">Pinned</span>
            </div>
          )}
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

        <div className="community-card__body min-w-0">
          {renderContent(displayContent, handleTagClick, handleMentionClick)}
        </div>

        {imageAttachments.length > 0 && (
          <div className="mt-4 space-y-3">
            {imageAttachments.map((attachment, index) => {
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
                <div key={`${post.id}-inline-image-${index}`} className="space-y-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setLightboxImage({ src: safeAttachmentUrl, alt: "Feed attachment" });
                    }}
                    className="group block w-full overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 sm:inline-block sm:w-auto sm:max-w-[18rem]"
                    title="View full image"
                  >
                    <img
                      src={safeAttachmentUrl}
                      alt="Feed attachment"
                      className="h-auto w-full object-cover transition duration-200 group-hover:scale-[1.02] sm:w-[18rem]"
                      loading="lazy"
                    />
                  </button>
                  {metaParts.length > 0 && (
                    <p className="text-[10px] text-[var(--fg-muted)]">{metaParts.join(" • ")}</p>
                  )}
                </div>
              );
            })}
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

        {otherAttachments.length > 0 && (
          <div className="mt-4 space-y-3">
            {otherAttachments.map((attachment, index) => {
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
                      className="group relative mx-auto block w-full max-w-[10rem] overflow-hidden rounded-2xl bg-black/10 sm:max-w-[12rem]"
                    >
                      <img
                        src={safeAttachmentUrl}
                        alt="Feed attachment"
                        className="h-auto w-full object-contain transition duration-200 group-hover:scale-[1.02]"
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

        {statusLabel && <p className="community-card__status">{statusLabel}</p>}

        {metaLeftItems.length > 0 && (
          <div className="community-card__meta">
            <div className="community-card__meta-left">
              {metaLeftItems.map(({ key, content }, index) => (
                <span
                  key={key}
                  className={`community-card__meta-item${index > 0 ? " community-card__meta-dot" : ""}`}
                >
                  {content}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="community-card__actions">
          {interactive && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenThread?.(post);
              }}
              className="community-card__action-button"
              title="Open thread"
            >
              <MessageSquareQuote className="h-4 w-4" />
              <span>Discuss</span>
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleLike(post);
            }}
            disabled={likeDisabled}
            className={`community-card__action-button${
              isPendingLike ? " community-card__action-button--active" : ""
            }`}
            title={isPendingLike ? "Sending like…" : "Like this post"}
          >
            {isPendingLike ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
            <span>Like</span>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleSharePost(post);
            }}
            className="community-card__action-button"
            title="Copy link to post"
          >
            <Share2 className="h-4 w-4" />
            <span>Share</span>
          </button>
          <div className="community-card__actions-menu">
            <button
              type="button"
              data-post-menu-trigger={post.id}
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                setOpenPostMenuId((current) => {
                  if (current === post.id) {
                    setPostMenuPosition(null);
                    return null;
                  }
                  setPostMenuPosition({
                    top: rect.bottom + 8,
                    left: rect.right + 8,
                  });
                  return post.id;
                });
              }}
              className="community-card__action-button"
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
              aria-label="Post options"
              title="Post options"
            >
              <Menu className="h-4 w-4" />
              <span>More</span>
            </button>
            {isMenuOpen && postMenuPosition && typeof document !== "undefined"
              ? createPortal(
                  <div
                    role="menu"
                    data-post-menu="true"
                    data-post-menu-id={post.id}
                    className="fixed z-[120] w-48 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-1 text-sm shadow-xl"
                    style={{
                      top: postMenuPosition.top,
                      left: postMenuPosition.left,
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(event) => {
                        event.stopPropagation();
                        closePostMenu();
                        toggleEventDetails(post.id);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[var(--fg-muted)] transition hover:bg-[var(--bg-muted)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                    >
                      {eventDetailsLabel}
                    </button>
                    {canEditPost && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(event) => {
                          event.stopPropagation();
                          closePostMenu();
                          openEditComposer(post);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[var(--fg-muted)] transition hover:bg-[var(--bg-muted)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                      >
                        Edit post
                      </button>
                    )}
                    {canModerate && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={pinActionDisabled}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (pinActionDisabled) {
                            return;
                          }
                          closePostMenu();
                          if (isPinned) {
                            void handleUnpinPost(post);
                          } else {
                            void handlePinPost(post);
                          }
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[var(--fg-muted)] transition hover:bg-[var(--bg-muted)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPinned ? "Unpin post" : "Pin post"}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={deleteDisabled}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (deleteDisabled) {
                            return;
                          }
                          closePostMenu();
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
                  </div>,
                  document.body,
                )
              : null}
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

  const createPostButton = (
    <button
      type="button"
      onClick={handlePost}
      disabled={!ready}
      className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] right-6 z-50 hidden items-center gap-3 rounded-full bg-brand px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-white shadow-lg transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-brand disabled:cursor-not-allowed disabled:bg-brand/40 sm:inline-flex sm:bottom-10 sm:px-6"
      aria-label="Create New Post"
    >
      <Plus className="h-5 w-5" />
      <span className="hidden sm:inline">Create New Post</span>
      <span className="sr-only sm:hidden">Create New Post</span>
    </button>
  );

  const createPostPortal =
    typeof document !== "undefined"
      ? createPortal(createPostButton, document.body)
      : createPostButton;

  return (
    <>
      <div className="relative flex h-full flex-1 flex-col overflow-hidden">
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

          {error && !composerOpen && (
            <p className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500">{error}</p>
          )}

          {initialLoading && posts.length === 0
            ? null
            : displayedPosts.length === 0
              ? emptyStateMessage ?? (
                  <p className="text-sm text-[var(--fg-muted)]">
                    No posts yet{activeFilter ? " for this filter." : "."} Be the first to share what you’re working on!
                  </p>
                )
              : displayedPosts.map((post) =>
                  renderPostCard(post, {
                    variant: "list",
                    registerNode: registerPost(post.id),
                    highlight: highlightedPostId === post.id,
                    onOpenThread: openThread,
                  }),
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
        {!hasMore && displayedPosts.length > 0 && (
          <p className="text-center text-xs text-[var(--fg-muted)]">You reached the end of the feed.</p>
        )}
        </ErrorBoundary>
      </div>

      {showNewPostsToast && (
        <button
          type="button"
          onClick={handleJumpToNewPosts}
          className="fixed left-1/2 z-40 -translate-x-1/2 rounded-full border border-[color:var(--chat-floating-control-border)] bg-[var(--chat-floating-control-bg)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--chat-floating-control-fg)] shadow-[var(--chat-floating-control-shadow)] transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 bottom-[calc(7rem+env(safe-area-inset-bottom,0px))] sm:bottom-36"
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
            <header className="relative space-y-3">
              <button
                type="button"
                onClick={closeThread}
                className="absolute right-0 top-0 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                aria-label="Close thread"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="space-y-1 pr-12">
                <h2
                  id="feed-thread-heading"
                  className="text-lg font-semibold uppercase tracking-[0.18em] text-[var(--fg-default)]"
                >
                  {activeThreadHeadingLabel}
                </h2>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--fg-muted)]">
                  {formatAbsoluteTimestamp(activeThreadPost.created_at) ?? ""}
                </p>
              </div>
            </header>

            {renderPostCard(activeThreadPost, { variant: "thread" })}

            {threadReplies.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-muted)]">
                No responses yet. Share your thoughts to start the conversation.
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

            {isThreadComposer && composerContent}
          </div>
        </div>
      )}

      {composerOverlay}

      {lightboxOverlay &&
        (typeof document !== "undefined"
          ? createPortal(lightboxOverlay, document.body)
          : lightboxOverlay)}
      </div>

      {createPostPortal}
    </>
  );
};

export default BitcoinSquareFeed;
