import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";

import BitcoinSquareFeed, { type FeedZapRequest } from "../components/bitcoinSquareChat/BitcoinSquareFeed";
import ErrorBoundary from "../components/ErrorBoundary";
import type { RoomDefinition } from "../components/RoomList";
import {
  CASUAL_ROOM_ID,
  CASUAL_ROOM_NAME,
  useBitcoinSquareCasualChat,
  type CasualChatMessage,
} from "../hooks/useBitcoinSquareCasualChat";
import type { CasualAttachmentMeta } from "../hooks/useBitcoinSquareCasualChat";
import { useMediaUploader, type MediaUploadResult, type UseMediaUploaderReturn } from "../hooks/useMediaUploader";
import { useBitcoinSquareFeed } from "../hooks/useBitcoinSquareFeed";
import { decryptBinary } from "../utils/aes";
import { getCachedMediaBlob, getCachedPreview, setCachedMediaBlob, setCachedPreview } from "../utils/mediaCache";
import { useProfileIdentity, shortenPubkey } from "../context/ProfileIdentityContext";
import type { ProfileSummary } from "../context/ProfileIdentityContext";
import { useAuth } from "../context/AuthContext";
import { useNostrAccount } from "../hooks/useNostrAccount";
import { nostrClient, setNostrClientSigner } from "../lib/nostrClient";
import { useTheme } from "../context/ThemeContext";
import {
  CommunityTranslationProvider,
  useCommunityTranslation,
} from "../context/CommunityTranslationContext";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  Heart,
  Languages,
  Loader2,
  MessageCircle,
  MessageSquareQuote,
  Newspaper,
  Paperclip,
  Send,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import ZapDialog from "../components/bitcoinSquareChat/ZapDialog";
import {
  countZapReferences,
  detectZapEndpoint,
  fetchLnurlDetails,
  requestZapInvoice,
  type LnurlPayResponse,
  type ZapEndpoint,
} from "../utils/zap";
import { markdownToHtml } from "../utils/markdown";

type ActiveView = "casual" | "feed" | "personal" | "members";

type ViewTab = { key: ActiveView; label: string; icon: LucideIcon };

const DESKTOP_VIEW_TABS: ViewTab[] = [
  { key: "casual", label: "Casual Chat", icon: MessageCircle },
  { key: "feed", label: "Public Feed", icon: Newspaper },
  { key: "personal", label: "Your Feed", icon: Sparkles },
];

const MOBILE_VIEW_TABS: ViewTab[] = [
  ...DESKTOP_VIEW_TABS,
  { key: "members", label: "Members", icon: Users },
];

const CASUAL_ROOM: RoomDefinition = {
  id: CASUAL_ROOM_ID,
  name: CASUAL_ROOM_NAME,
  type: "private",
  hasLocalKey: true,
};

type PendingAttachment = MediaUploadResult & { previewUrl?: string | null };

type AttachmentStatus = "idle" | "loading" | "ready" | "error";

interface QuoteContextState {
  id: string;
  pubkey: string;
  createdAt: number;
  displayName: string;
  snippet: string;
}

interface AuthorAccent {
  border: string;
  shadow: string;
  dot: string;
}

const ACTIVE_MEMBER_WINDOW_SECONDS = 60;
const CHAT_CHARACTER_LIMIT = 500;
const LIGHT_BACKGROUND_TEXTURE =
  "radial-gradient(circle at top, rgba(148,163,184,0.16), transparent 60%), radial-gradient(circle at bottom right, rgba(129,140,248,0.12), transparent 55%)";
const DARK_BACKGROUND_TEXTURE =
  "radial-gradient(circle at top, rgba(59,130,246,0.16), transparent 55%), radial-gradient(circle at bottom right, rgba(16,185,129,0.14), transparent 50%)";

const MEMBER_LIST_INITIAL_LIMIT = 20;
const MEMBER_LIST_PAGE_SIZE = 20;
const MEMBER_SCROLL_THRESHOLD_PX = 120;

const formatTimestamp = (unixSeconds: number) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(unixSeconds * 1000));
  } catch {
    return new Date(unixSeconds * 1000).toLocaleString();
  }
};

const formatDateLabel = (unixSeconds: number) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
    }).format(new Date(unixSeconds * 1000));
  } catch {
    return new Date(unixSeconds * 1000).toDateString();
  }
};

const getDateKey = (unixSeconds: number) => {
  const date = new Date(unixSeconds * 1000);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildQuoteSnippet = (markdown: string) => {
  const condensed = markdown.replace(/\s+/g, " ").trim();
  if (condensed.length <= 140) return condensed;
  return `${condensed.slice(0, 137)}…`;
};

const computeAuthorAccent = (pubkey: string): AuthorAccent => {
  let hash = 0;
  for (let i = 0; i < pubkey.length; i += 1) {
    hash = (hash * 31 + pubkey.charCodeAt(i)) % 360;
  }
  const hue = hash;
  return {
    border: `hsla(${hue}, 75%, 65%, 0.8)`,
    shadow: `hsla(${hue}, 70%, 45%, 0.25)`,
    dot: `hsla(${hue}, 85%, 55%, 1)`,
  };
};

const formatLastSeenLabel = (unixSeconds: number) => {
  const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diffSeconds < ACTIVE_MEMBER_WINDOW_SECONDS) return "Active now";
  if (diffSeconds < 3600) return `Active ${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86_400) return `Active ${Math.floor(diffSeconds / 3600)}h ago`;
  return `Active ${Math.floor(diffSeconds / 86_400)}d ago`;
};

const collectMemberActivity = <T extends { pubkey: string; created_at: number }>(items: T[]) => {
  const seen = new Map<string, number>();
  items.forEach((item) => {
    if (!item?.pubkey) return;
    const timestamp =
      typeof item.created_at === "number" && Number.isFinite(item.created_at)
        ? Math.max(0, Math.floor(item.created_at))
        : 0;
    const previous = seen.get(item.pubkey) ?? 0;
    seen.set(item.pubkey, Math.max(previous, timestamp));
  });
  return seen;
};

interface MemberListEntry {
  pubkey: string;
  lastSeen: number;
  summary: ProfileSummary;
  isCurrentUser: boolean;
}

const extractRelaysFromTags = (tags?: string[][] | null): string[] => {
  if (!tags) return [];
  const relays = new Set<string>();
  tags.forEach((tag) => {
    if (!Array.isArray(tag) || tag.length === 0) return;
    if (tag[0] === "relays") {
      tag.slice(1).forEach((value) => {
        if (typeof value === "string" && value.trim().length > 0) {
          relays.add(value);
        }
      });
    }
    if (tag[0] === "relay" && typeof tag[1] === "string" && tag[1].trim().length > 0) {
      relays.add(tag[1]);
    }
  });
  return Array.from(relays);
};

interface CommunityZapTarget {
  key: string;
  context: "feed" | "chat" | "profile";
  endpoint: ZapEndpoint;
  authorPubkey: string;
  noteId?: string | null;
  relays?: string[];
  summary: ProfileSummary;
  snippet?: string | null;
}

interface ZapDialogState {
  open: boolean;
  target: CommunityZapTarget | null;
  stage: "select" | "paying" | "invoice" | "success" | "error";
  lnurl: LnurlPayResponse | null;
  lnurlLoading: boolean;
  invoice: string | null;
  amountSats?: number;
  error: string | null;
  weblnTried: boolean;
}

const createInitialZapState = (): ZapDialogState => ({
  open: false,
  target: null,
  stage: "select",
  lnurl: null,
  lnurlLoading: false,
  invoice: null,
  amountSats: undefined,
  error: null,
  weblnTried: false,
});

const base64ToUint8Array = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const createPreviewFromBlob = async (blob: Blob) => {
  if (typeof window === "undefined") return null;
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const maxDimension = 320;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.6);
  } catch (error) {
    console.warn("Failed to create preview", error);
    return null;
  }
};

const AttachmentPreview: React.FC<{ attachment: CasualAttachmentMeta }> = ({ attachment }) => {
  const [status, setStatus] = useState<AttachmentStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);

    const load = async () => {
      try {
        const cachedPreview = await getCachedPreview(CASUAL_ROOM_ID, attachment.digest);
        if (cachedPreview && !cancelled) {
          setPreviewUrl(cachedPreview);
        }

        const cachedBlob = await getCachedMediaBlob(CASUAL_ROOM_ID, attachment.digest);
        if (cachedBlob) {
          const url = URL.createObjectURL(cachedBlob);
          objectUrlRef.current = url;
          if (!cancelled) {
            setFullUrl(url);
            setStatus("ready");
          }
          return;
        }

        const response = await fetch(attachment.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch media (${response.status})`);
        }
        const payload = await response.arrayBuffer();
        let buffer = payload;
        if (attachment.iv) {
          const iv = base64ToUint8Array(attachment.iv);
          buffer = await decryptBinary(CASUAL_ROOM_ID, payload, iv);
        }

        const blob = new Blob([buffer], { type: attachment.mimeType });
        const preview = await createPreviewFromBlob(blob);
        if (preview) {
          await setCachedPreview(CASUAL_ROOM_ID, attachment.digest, preview);
          if (!cancelled) {
            setPreviewUrl(preview);
          }
        }
        await setCachedMediaBlob(CASUAL_ROOM_ID, attachment.digest, blob);
        if (!cancelled) {
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          setFullUrl(url);
          setStatus("ready");
        }
      } catch (loadError) {
        console.error("Failed to load attachment", loadError);
        if (!cancelled) {
          setStatus("error");
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, [attachment.digest, attachment.iv, attachment.mimeType, attachment.url]);

  return (
    <div className="space-y-2">
      {previewUrl && (
        <img
          src={previewUrl}
          alt="Attachment preview"
          className={`max-h-48 w-full rounded-lg object-cover ${status !== "ready" ? "opacity-60" : ""}`}
          loading="lazy"
        />
      )}
      {status === "ready" && fullUrl && (
        attachment.mimeType.startsWith("video/") ? (
          <video src={fullUrl} controls className="max-h-64 w-full rounded-lg" />
        ) : (
          <a
            href={fullUrl}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border border-[var(--border-subtle)]"
          >
            <img src={fullUrl} alt="Attachment" className="w-full object-contain" loading="lazy" />
          </a>
        )
      )}
      {status === "loading" && <p className="text-xs text-[var(--fg-muted)]">Loading media…</p>}
      {status === "error" && (
        <p className="text-xs text-red-500">{error ?? "Unable to load media"}</p>
      )}
    </div>
  );
};

const Composer: React.FC<{
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
  onUploadFile: (file: File) => Promise<void>;
  pendingAttachments: PendingAttachment[];
  onRemoveAttachment: (cacheKey: string) => void;
  uploadStatus: UseMediaUploaderReturn["status"];
  uploadProgress: number;
  uploadError: string | null;
  draft?: string;
  onTyping?: () => void;
  quoteContext?: QuoteContextState | null;
  onClearQuote?: () => void;
  onJumpToQuote?: (messageId: string) => void;
}> = ({
  disabled,
  onSend,
  onUploadFile,
  pendingAttachments,
  onRemoveAttachment,
  uploadStatus,
  uploadProgress,
  uploadError,
  draft,
  onTyping,
  quoteContext,
  onClearQuote,
  onJumpToQuote,
}) => {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingEmitRef = useRef(0);

  const characterCount = value.length;
  const characterStatusClass =
    characterCount >= CHAT_CHARACTER_LIMIT
      ? "text-red-500"
      : characterCount > CHAT_CHARACTER_LIMIT - 40
        ? "text-brand"
        : "text-[var(--fg-muted)]";

  useEffect(() => {
    if (typeof draft === "string") {
      setValue(draft);
    }
  }, [draft]);

  const emitTyping = useCallback(() => {
    if (!onTyping) return;
    const now = Date.now();
    if (now - typingEmitRef.current < 400) return;
    typingEmitRef.current = now;
    onTyping();
  }, [onTyping]);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isSending) return;
    setIsSending(true);
    try {
      await onSend(trimmed);
      setValue("");
      setError(null);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      setError(message);
    } finally {
      setIsSending(false);
    }
  }, [disabled, isSending, onSend, value]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    emitTyping();
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
    emitTyping();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await onUploadFile(file);
    } catch (uploadErr) {
      const message = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
      setError(message);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-3">
      {quoteContext && (
        <div className="flex items-start justify-between rounded-2xl border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand shadow-sm">
          <button
            type="button"
            onClick={() => quoteContext && onJumpToQuote?.(quoteContext.id)}
            className="flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <p className="font-semibold uppercase tracking-[0.24em] text-brand/80">
              Quoting {quoteContext.displayName}
            </p>
            <p className="mt-1 text-[11px] font-medium text-brand/90">
              {quoteContext.snippet || "Quoted message"}
            </p>
            <p className="mt-2 text-[9px] uppercase tracking-[0.3em] text-brand/60">
              {formatTimestamp(quoteContext.createdAt)}
            </p>
          </button>
          {onClearQuote && (
            <button
              type="button"
              onClick={onClearQuote}
              className="ml-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-brand/40 text-brand transition hover:bg-brand hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <X className="h-3 w-3" aria-hidden />
              <span className="sr-only">Remove quote</span>
            </button>
          )}
        </div>
      )}
      <div className="relative rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm transition focus-within:border-brand">
        <textarea
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || isSending}
          rows={3}
          maxLength={CHAT_CHARACTER_LIMIT}
          placeholder={disabled ? "Your BitcoinSquare keys must be ready before posting" : "Share an update…"}
          className="w-full resize-none rounded-2xl border-none bg-transparent px-4 pb-14 pr-28 text-sm leading-relaxed text-[var(--fg-default)] focus:outline-none focus:ring-0"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-4 pb-3">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploadStatus === "uploading"}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--fg-muted)] shadow-sm transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
              title={uploadStatus === "uploading" ? `Uploading… ${uploadProgress}%` : "Add media"}
            >
              {uploadStatus === "uploading" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Paperclip className="h-4 w-4" aria-hidden />
              )}
              <span className="sr-only">Add media</span>
            </button>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={disabled || isSending || value.trim().length === 0}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              <span className="sr-only">Send message</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className={`font-semibold ${characterStatusClass}`} aria-live="polite">
          {`${characterCount} / ${CHAT_CHARACTER_LIMIT}`}
        </span>
        <span className="font-semibold text-[var(--fg-muted)]" aria-live="polite">
          {uploadStatus === "uploading" ? `Uploading… ${uploadProgress}%` : ""}
        </span>
      </div>

      {pendingAttachments.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Attachments</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {pendingAttachments.map((attachment) => (
              <div key={attachment.cacheKey} className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                {attachment.previewUrl ? (
                  <img
                    src={attachment.previewUrl}
                    alt="Pending attachment"
                    className="max-h-48 w-full rounded-lg object-cover"
                  />
                ) : (
                  <p className="text-xs text-[var(--fg-muted)]">Preview not available yet…</p>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(attachment.cacheKey)}
                  className="absolute right-3 top-3 rounded-full border border-[var(--border-subtle)] bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur transition hover:bg-brand"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {uploadError && uploadStatus === "error" && <p className="text-xs text-red-500">{uploadError}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
};

const CommunityView: React.FC = () => {
  const { theme } = useTheme();
  const {
    roomId,
    messages: rawMessages,
    sendMessage,
    pubkey,
    ready,
    roomKeyError,
    error: sendError,
    typingPubkeys,
    sendTyping,
  } = useBitcoinSquareCasualChat();

  const messages = useMemo(() => [...rawMessages].reverse(), [rawMessages]);

  const {
    posts: feedPosts,
    ready: feedReady,
    publishing: feedPublishing,
    publishStatus: publishFeedStatus,
    likePost: likeFeedPost,
    loadMore: loadMoreFeed,
    loadingMore: feedLoadingMore,
    hasMore: feedHasMore,
    error: feedError,
    pubkey: feedPubkey,
    initialLoading: feedInitialLoading,
  } = useBitcoinSquareFeed();
  const { user, refreshNostrKeys } = useAuth();
  const {
    ready: accountReady,
    loading: accountLoading,
    signEvent: globalSignEvent,
    pubkey: accountPubkey,
    error: accountError,
  } = useNostrAccount();
  const hasLightningWallet = Boolean(user?.lnWalletAddress);
  const canZap = accountReady && Boolean(globalSignEvent);

  const {
    autoTranslateEnabled,
    setAutoTranslateEnabled,
    ensureTranslation,
    refreshTranslation,
    getTranslation,
    isOriginalVisible,
    toggleOriginal,
    targetLanguageLabel,
    formatLanguageName,
  } = useCommunityTranslation();

  const [activeView, setActiveView] = useState<ActiveView>("casual");
  const listRef = useRef<HTMLDivElement | null>(null);
  const composerContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollUpdateFrameRef = useRef<number | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const {
    uploadFile,
    progress: uploadProgress,
    status: uploadStatus,
    previewUrl: latestPreview,
    error: uploadError,
    reset: resetUpload,
  } = useMediaUploader({ room: CASUAL_ROOM, pubkey });
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState<string | undefined>(undefined);
  const [walletPromptOpen, setWalletPromptOpen] = useState(false);
  const [quoteContext, setQuoteContext] = useState<QuoteContextState | null>(null);
  const [isAtTop, setIsAtTop] = useState(true);
  const [newMessageAnchor, setNewMessageAnchor] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [zapCounts, setZapCounts] = useState<Record<string, number>>({});
  const [pendingZaps, setPendingZaps] = useState<Set<string>>(() => new Set());
  const [zapState, setZapState] = useState<ZapDialogState>(() => createInitialZapState());
  const [composerHeight, setComposerHeight] = useState(0);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());
  const highlightTimerRef = useRef<number | null>(null);
  const pendingHighlightRef = useRef<string | null>(null);
  const previousMessageIdsRef = useRef<string[]>([]);
  const previousLatestMessageRef = useRef<{ id: string; createdAt: number } | null>(null);
  const initialScrollDoneRef = useRef(false);
  const estimatedRowHeight = 220;
  const rowHeightsRef = useRef(new Map<string, number>());
  const resizeObserversRef = useRef(new Map<string, ResizeObserver>());
  const [virtualVersion, setVirtualVersion] = useState(0);
  const { requestProfile, resolveProfileSummary, openProfile, follow, following } = useProfileIdentity();
  const backgroundTexture = useMemo(
    () => (theme === "dark" ? DARK_BACKGROUND_TEXTURE : LIGHT_BACKGROUND_TEXTURE),
    [theme],
  );
  const isCasualView = activeView === "casual";
  const isPublicFeedView = activeView === "feed";
  const isPersonalFeedView = activeView === "personal";
  const isAnyFeedView = isPublicFeedView || isPersonalFeedView;
  const isMembersView = activeView === "members";
  const personalFeedPosts = useMemo(
    () => feedPosts.filter((post) => following.has(post.pubkey)),
    [feedPosts, following],
  );
  const hasFollowing = following.size > 0;

  useEffect(() => {
    if (!isCasualView) {
      setComposerHeight(0);
      return;
    }
    const node = composerContainerRef.current;
    if (!node) {
      return;
    }
    const measure = () => {
      const height = node.getBoundingClientRect().height;
      setComposerHeight(Math.ceil(height));
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => {
        observer.disconnect();
      };
    }
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
    };
  }, [isCasualView]);

  const chatSpacing = useMemo(() => {
    const safeInset = "env(safe-area-inset-bottom, 0px)";
    const fallbackHeight = "7rem";
    const measuredHeight = isCasualView && composerHeight > 0 ? `${composerHeight}px` : fallbackHeight;
    const contentPadding = `calc(${measuredHeight} + ${safeInset} + 1.5rem)`;
    const scrollPadding = `calc(${measuredHeight} + ${safeInset} + 1rem)`;
    return {
      contentPadding,
      scrollPadding,
      buttonOffset: scrollPadding,
    };
  }, [composerHeight, isCasualView]);

  const jumpButtonStyle = useMemo<React.CSSProperties>(() => {
    if (!chatSpacing.buttonOffset) {
      return {};
    }
    return {
      bottom: chatSpacing.buttonOffset,
    };
  }, [chatSpacing.buttonOffset]);

  const setPendingZap = useCallback((key: string, pending: boolean) => {
    setPendingZaps((prev) => {
      const has = prev.has(key);
      if ((pending && has) || (!pending && !has)) {
        return prev;
      }
      const next = new Set(prev);
      if (pending) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const adjustZapCount = useCallback((key: string, delta: number) => {
    setZapCounts((prev) => {
      const current = prev[key] ?? 0;
      const nextValue = Math.max(0, current + delta);
      if (nextValue === current) {
        return prev;
      }
      return { ...prev, [key]: nextValue };
    });
  }, []);

  const handleOpenZap = useCallback(
    (target: CommunityZapTarget) => {
      if (!hasLightningWallet) {
        setWalletPromptOpen(true);
      }

      if (!globalSignEvent || !accountReady) {
        setZapState({
          ...createInitialZapState(),
          open: true,
          target,
          stage: "error",
          error:
            "We need your Nostr signer ready to send zaps. Refresh your keys from the dashboard and try again.",
        });
        return;
      }

      setZapState({
        ...createInitialZapState(),
        open: true,
        target,
        stage: target.endpoint.type === "lnurl" ? "select" : "invoice",
        lnurlLoading: target.endpoint.type === "lnurl",
        invoice: target.endpoint.type === "bolt11" ? target.endpoint.invoice : null,
      });
    },
    [accountReady, globalSignEvent, hasLightningWallet],
  );

  useEffect(() => {
    if (!zapState.open || !zapState.target) {
      return;
    }
    if (zapState.target.endpoint.type !== "lnurl") {
      return;
    }
    if (zapState.lnurlLoading || zapState.lnurl) {
      return;
    }

    let cancelled = false;
    setZapState((prev) => ({ ...prev, lnurlLoading: true }));

    (async () => {
      try {
        const details = await fetchLnurlDetails(zapState.target!.endpoint.url);
        if (cancelled) return;
        setZapState((prev) => ({ ...prev, lnurl: details, lnurlLoading: false }));
      } catch (error) {
        if (cancelled) return;
        if (import.meta.env?.DEV) {
          console.error("Zap details fetch failed", error);
        }
        const message = error instanceof Error ? error.message : "Unable to load zap details.";
        setZapState((prev) => ({ ...prev, stage: "error", lnurlLoading: false, error: message }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [zapState.open, zapState.target, zapState.lnurl, zapState.lnurlLoading]);

  const handleSubmitZap = useCallback(
    (amount: number, comment?: string) => {
      if (!zapState.target) {
        return;
      }

      const target = zapState.target;
      const lnurlDetails = zapState.lnurl;

      setZapState((prev) => ({
        ...prev,
        stage: "paying",
        amountSats: amount,
        error: null,
        invoice: null,
        weblnTried: false,
      }));
      setPendingZap(target.key, true);

      (async () => {
        try {
          if (target.endpoint.type === "lnurl") {
            if (!lnurlDetails) {
              throw new Error("Zap details are still loading. Please wait a moment.");
            }
            const response = await requestZapInvoice({
              details: lnurlDetails,
              amountMsat: Math.round(amount * 1000),
              targetPubkey: target.authorPubkey,
              noteId: target.noteId ?? null,
              relays: target.relays,
              comment,
              signEvent: globalSignEvent,
              lnurlRaw: target.endpoint.raw,
              logger: import.meta.env?.DEV ? console : undefined,
            });
            if (response.event) {
              try {
                await nostrClient.broadcast(response.event);
              } catch (relayError) {
                if (import.meta.env?.DEV) {
                  console.warn("Zap event broadcast failed", relayError);
                }
              }
            }
            const invoice = response.pr;
            if (typeof window !== "undefined" && window.webln) {
              try {
                await window.webln.enable();
                await window.webln.sendPayment(invoice);
                adjustZapCount(target.key, 1);
                setPendingZap(target.key, false);
                setZapState((prev) => ({ ...prev, stage: "success", invoice, weblnTried: true }));
                return;
              } catch (weblnError) {
                if (import.meta.env?.DEV) {
                  console.warn("WebLN payment failed", weblnError);
                }
                setZapState((prev) => ({ ...prev, stage: "invoice", invoice, weblnTried: true }));
              }
            } else {
              setZapState((prev) => ({ ...prev, stage: "invoice", invoice, weblnTried: false }));
            }
            setPendingZap(target.key, false);
          } else {
            setZapState((prev) => ({
              ...prev,
              stage: "invoice",
              invoice: target.endpoint.invoice,
              amountSats: amount,
            }));
            setPendingZap(target.key, false);
          }
        } catch (error) {
          if (import.meta.env?.DEV) {
            console.error("Zap submission failed", error);
          }
          const message = error instanceof Error ? error.message : "Zap failed. Try again later.";
          setZapState((prev) => ({ ...prev, stage: "error", error: message }));
          setPendingZap(target.key, false);
        }
      })();
    },
    [adjustZapCount, globalSignEvent, setPendingZap, zapState.lnurl, zapState.target],
  );

  const handleZapRetry = useCallback(() => {
    setZapState((prev) => {
      if (!prev.target) {
        return prev;
      }
      return {
        ...prev,
        stage: prev.target.endpoint.type === "lnurl" ? "select" : "invoice",
        error: null,
        weblnTried: false,
      };
    });
  }, []);

  const handleZapMarkPaid = useCallback(() => {
    if (!zapState.target) {
      return;
    }
    adjustZapCount(zapState.target.key, 1);
    setPendingZap(zapState.target.key, false);
    setZapState((prev) => ({ ...prev, stage: "success" }));
  }, [adjustZapCount, setPendingZap, zapState.target]);

  const handleZapClose = useCallback(() => {
    if (zapState.target) {
      setPendingZap(zapState.target.key, false);
    }
    setZapState(createInitialZapState());
  }, [setPendingZap, zapState.target]);

  const handleFeedZapRequest = useCallback(
    (request: FeedZapRequest) => {
      handleOpenZap({
        key: request.key,
        context: "feed",
        endpoint: request.endpoint,
        authorPubkey: request.authorPubkey,
        noteId: request.noteId,
        relays: request.relays,
        summary: request.summary,
        snippet: request.snippet,
      });
    },
    [handleOpenZap],
  );

  const handleMemberZap = useCallback(
    (pubkeyValue: string, summary: ProfileSummary, endpoint: ZapEndpoint) => {
      handleOpenZap({
        key: `profile:${pubkeyValue}`,
        context: "profile",
        endpoint,
        authorPubkey: pubkeyValue,
        summary,
      });
    },
    [handleOpenZap],
  );

  useEffect(() => {
    if (accountReady && globalSignEvent) {
      setNostrClientSigner(globalSignEvent, accountPubkey ?? null);
    } else {
      setNostrClientSigner(null);
    }
    return () => {
      setNostrClientSigner(null);
    };
  }, [accountPubkey, accountReady, globalSignEvent]);

  const renderContent = useCallback(() => {
    if (!user) {
      return <Navigate to="/login" replace />;
    }

    if (accountLoading) {
      return (
        <div className="flex h-full items-center justify-center bg-[var(--bg-app)] px-6 py-12">
          <div className="max-w-lg rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 text-center shadow-sm">
            <h1 className="text-lg font-semibold uppercase tracking-[0.24em] text-[var(--fg-default)]">
              Loading account keys
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[var(--fg-muted)]">
              We&apos;re securely retrieving your BitcoinSquare-issued Nostr credentials. This only takes a
              moment.
            </p>
          </div>
        </div>
      );
    }

    if (!accountReady || !globalSignEvent || !accountPubkey) {
      return (
        <div className="flex h-full items-center justify-center bg-[var(--bg-app)] px-6 py-12">
          <div className="max-w-lg rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 text-center shadow-sm">
            <h1 className="text-lg font-semibold uppercase tracking-[0.24em] text-[var(--fg-default)]">
              Unable to access keys
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[var(--fg-muted)]">
              {accountError
                ? accountError
                : 'We couldn\'t load the Nostr keys linked to your BitcoinSquare account. If your dashboard shows active keys, try refreshing them below.'}
            </p>
            <button
              type="button"
              onClick={() => refreshNostrKeys().catch(() => undefined)}
              className="mt-6 inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Retry key sync
            </button>
          </div>
        </div>
      );
    }

    return null;
  }, [
    accountError,
    accountLoading,
    accountPubkey,
    accountReady,
    globalSignEvent,
    refreshNostrKeys,
    user,
  ]);

  useEffect(() => {
    const uniquePubkeys = new Set<string>();
    messages.forEach((message) => {
      uniquePubkeys.add(message.pubkey);
      if (message.quotePubkey) {
        uniquePubkeys.add(message.quotePubkey);
      }
    });
    feedPosts.forEach((post) => uniquePubkeys.add(post.pubkey));
    typingPubkeys.forEach((key) => uniquePubkeys.add(key));
    uniquePubkeys.forEach((pubkeyValue) => {
      requestProfile(pubkeyValue).catch(() => undefined);
    });
  }, [feedPosts, messages, requestProfile, typingPubkeys]);

  useEffect(() => {
    if (!autoTranslateEnabled) return;
    messages.forEach((message) => {
      ensureTranslation(`chat:${message.id}`, message.markdown);
    });
  }, [autoTranslateEnabled, ensureTranslation, messages]);

  const computeScrollState = useCallback(() => {
    const node = listRef.current;
    if (!node) return;
    const threshold = 80;
    const atTop = node.scrollTop < threshold;
    setIsAtTop(atTop);
    if (atTop) {
      setNewMessageAnchor((current) => (current ? null : current));
    }
    setVirtualVersion((value) => value + 1);
  }, []);

  const scrollToTop = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const node = listRef.current;
      if (!node) return;
      node.scrollTo({ top: 0, behavior });
    },
    [],
  );

  const scheduleScrollState = useCallback(() => {
    if (typeof window === "undefined") {
      computeScrollState();
      return;
    }
    if (scrollUpdateFrameRef.current !== null) {
      return;
    }
    scrollUpdateFrameRef.current = window.requestAnimationFrame(() => {
      scrollUpdateFrameRef.current = null;
      computeScrollState();
    });
  }, [computeScrollState]);

  useEffect(
    () => () => {
      if (typeof window !== "undefined" && scrollUpdateFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollUpdateFrameRef.current);
        scrollUpdateFrameRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const handle = () => scheduleScrollState();
    node.addEventListener("scroll", handle);
    computeScrollState();
    return () => node.removeEventListener("scroll", handle);
  }, [activeView, computeScrollState, scheduleScrollState]);

  useEffect(() => {
    if (activeView !== "casual") {
      previousMessageIdsRef.current = messages.map((message) => message.id);
      const latestMessage = messages[0];
      previousLatestMessageRef.current =
        latestMessage != null
          ? { id: latestMessage.id, createdAt: latestMessage.created_at }
          : null;
      initialScrollDoneRef.current = false;
      return;
    }

    const latestMessage = messages[0];

    if (!initialScrollDoneRef.current && latestMessage) {
      initialScrollDoneRef.current = true;
      scrollToTop("auto");
      computeScrollState();
    } else if (latestMessage) {
      const previousLatest = previousLatestMessageRef.current;
      const hasNewerMessage =
        !previousLatest ||
        latestMessage.created_at > previousLatest.createdAt ||
        (latestMessage.created_at === previousLatest.createdAt && latestMessage.id !== previousLatest.id);

      if (hasNewerMessage) {
        scrollToTop("smooth");
        setNewMessageAnchor(null);
        scheduleScrollState();
      }
    }

    previousMessageIdsRef.current = messages.map((message) => message.id);
    previousLatestMessageRef.current =
      latestMessage != null ? { id: latestMessage.id, createdAt: latestMessage.created_at } : null;
  }, [activeView, computeScrollState, messages, scheduleScrollState, scrollToTop]);

  useEffect(() => {
    setVirtualVersion((value) => value + 1);
  }, [messages.length]);

  useEffect(() => {
    const activeIds = new Set(messages.map((message) => message.id));
    rowHeightsRef.current.forEach((_, key) => {
      if (!activeIds.has(key)) {
        rowHeightsRef.current.delete(key);
      }
    });
  }, [messages]);

  useEffect(() => {
    if (activeView === "casual") {
      if (typeof window === "undefined") {
        scrollToTop("auto");
        computeScrollState();
        return;
      }
      window.requestAnimationFrame(() => {
        scrollToTop("auto");
        computeScrollState();
      });
    }
  }, [activeView, computeScrollState, scrollToTop]);

  useEffect(() => {
    if (!walletPromptOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWalletPromptOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [walletPromptOpen]);

  const casualMemberActivity = useMemo(() => collectMemberActivity(messages), [messages]);
  const feedMemberActivity = useMemo(() => collectMemberActivity(feedPosts), [feedPosts]);

  const contextMembers = useMemo<MemberListEntry[]>(() => {
    const now = Math.floor(Date.now() / 1000);
    const merged = new Map<string, number>();

    const mergeSource = (source: Map<string, number>) => {
      source.forEach((timestamp, memberKey) => {
        const previous = merged.get(memberKey) ?? 0;
        merged.set(memberKey, Math.max(previous, timestamp));
      });
    };

    if (isMembersView) {
      mergeSource(casualMemberActivity);
      mergeSource(feedMemberActivity);
    } else if (isAnyFeedView) {
      mergeSource(feedMemberActivity);
    } else {
      mergeSource(casualMemberActivity);
    }

    if (pubkey) {
      const currentTimestamp = Math.max(merged.get(pubkey) ?? 0, now);
      merged.set(pubkey, currentTimestamp);
    }

    const entries: MemberListEntry[] = Array.from(merged.entries()).map(([memberKey, lastSeen]) => ({
      pubkey: memberKey,
      lastSeen,
      summary: resolveProfileSummary(memberKey),
      isCurrentUser: memberKey === pubkey,
    }));

    let currentMember: MemberListEntry | null = null;
    const others: MemberListEntry[] = [];

    entries.forEach((entry) => {
      if (entry.isCurrentUser) {
        currentMember = entry;
      } else {
        others.push(entry);
      }
    });

    others.sort((a, b) => {
      const diff = (b.lastSeen ?? 0) - (a.lastSeen ?? 0);
      if (diff !== 0) {
        return diff;
      }
      return a.summary.displayName.localeCompare(b.summary.displayName, undefined, {
        sensitivity: "base",
        numeric: true,
      });
    });

    return currentMember ? [currentMember, ...others] : others;
  }, [
    casualMemberActivity,
    feedMemberActivity,
    isAnyFeedView,
    isMembersView,
    pubkey,
    resolveProfileSummary,
  ]);

  const [visibleMemberCount, setVisibleMemberCount] = useState(MEMBER_LIST_INITIAL_LIMIT);
  const [memberScrollContainer, setMemberScrollContainer] = useState<HTMLDivElement | null>(null);

  const { currentMemberEntry, followingMemberEntries, otherOnlineMemberEntries } = useMemo(() => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    let current: MemberListEntry | null = null;
    const followed: MemberListEntry[] = [];
    const otherOnline: MemberListEntry[] = [];

    const sortByRecency = (a: MemberListEntry, b: MemberListEntry) => {
      const diff = (b.lastSeen ?? 0) - (a.lastSeen ?? 0);
      if (diff !== 0) {
        return diff;
      }
      return a.summary.displayName.localeCompare(b.summary.displayName, undefined, {
        sensitivity: "base",
        numeric: true,
      });
    };

    contextMembers.forEach((member) => {
      if (member.isCurrentUser) {
        current = member;
        return;
      }
      if (following.has(member.pubkey)) {
        followed.push(member);
        return;
      }
      const lastSeen = member.lastSeen ?? 0;
      if (lastSeen > 0 && nowSeconds - lastSeen < ACTIVE_MEMBER_WINDOW_SECONDS) {
        otherOnline.push(member);
      }
    });

    followed.sort(sortByRecency);
    otherOnline.sort(sortByRecency);

    return {
      currentMemberEntry: current,
      followingMemberEntries: followed,
      otherOnlineMemberEntries: otherOnline,
    };
  }, [contextMembers, following]);

  const totalMemberPool = followingMemberEntries.length + otherOnlineMemberEntries.length;
  const displayedFollowingMembers = followingMemberEntries.slice(0, visibleMemberCount);
  const remainingMemberSlots = Math.max(visibleMemberCount - displayedFollowingMembers.length, 0);
  const displayedOtherOnlineMembers = otherOnlineMemberEntries.slice(0, remainingMemberSlots);
  const hasMoreMembers = visibleMemberCount < totalMemberPool;
  const memberScrollRef = useCallback((node: HTMLDivElement | null) => {
    setMemberScrollContainer(node);
  }, []);

  const followingCount = following.size;

  useEffect(() => {
    setVisibleMemberCount(MEMBER_LIST_INITIAL_LIMIT);
    if (memberScrollContainer) {
      memberScrollContainer.scrollTo({ top: 0 });
    }
  }, [contextMembers.length, followingCount, memberScrollContainer]);

  useEffect(() => {
    if (!memberScrollContainer) return;

    const handleScroll = () => {
      if (!hasMoreMembers) {
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = memberScrollContainer;
      if (scrollHeight - (scrollTop + clientHeight) < MEMBER_SCROLL_THRESHOLD_PX) {
        setVisibleMemberCount((prev) => {
          if (prev >= totalMemberPool) {
            return prev;
          }
          return Math.min(prev + MEMBER_LIST_PAGE_SIZE, totalMemberPool);
        });
      }
    };

    memberScrollContainer.addEventListener("scroll", handleScroll);
    return () => {
      memberScrollContainer.removeEventListener("scroll", handleScroll);
    };
  }, [memberScrollContainer, hasMoreMembers, totalMemberPool]);

  useEffect(() => {
    if (!memberScrollContainer) return;
    if (!hasMoreMembers) return;
    const { scrollHeight, clientHeight } = memberScrollContainer;
    if (scrollHeight - clientHeight < MEMBER_SCROLL_THRESHOLD_PX) {
      setVisibleMemberCount((prev) => {
        if (prev >= totalMemberPool) {
          return prev;
        }
        return Math.min(prev + MEMBER_LIST_PAGE_SIZE, totalMemberPool);
      });
    }
  }, [memberScrollContainer, hasMoreMembers, totalMemberPool, visibleMemberCount]);
  const recommendedMembers = useMemo(
    () =>
      contextMembers
        .filter((member) => !member.isCurrentUser && !following.has(member.pubkey))
        .slice(0, 6),
    [contextMembers, following],
  );

  const renderMemberRow = (member: MemberListEntry) => {
    const lastSeenLabel = member.isCurrentUser
      ? "Active now"
      : member.lastSeen > 0
        ? formatLastSeenLabel(member.lastSeen)
        : "No activity yet";
    const profileZapKey = `profile:${member.pubkey}`;
    const profileZapEndpoint = detectZapEndpoint({
      lightningAddress: member.summary.lightningAddress,
    });
    const profileZapCount = zapCounts[profileZapKey] ?? 0;
    const profileZapPending = pendingZaps.has(profileZapKey);
    const profileZapDisplayCount = Math.max(
      0,
      profileZapCount + (profileZapPending ? 1 : 0),
    );
    const profileZapTitle = !profileZapEndpoint
      ? "Zaps unavailable"
      : profileZapPending
        ? "Sending zap…"
        : canZap
          ? `Zap ${member.summary.displayName}`
          : "Preparing your Nostr keys…";

    return (
      <div
        key={member.pubkey}
        className="flex w-full items-center gap-3 rounded-2xl border border-white/60 bg-white/80 px-3 py-2 text-left shadow-sm transition hover:border-brand hover:text-brand focus-within:ring-2 focus-within:ring-brand/60 dark:border-neutral-800 dark:bg-neutral-900/70"
      >
        <button
          type="button"
          onClick={() => openProfile(member.pubkey)}
          className="flex flex-1 items-center gap-3 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <img
            src={member.summary.avatarUrl}
            alt={member.summary.displayName}
            className="h-10 w-10 rounded-full border border-white/80 object-cover shadow-sm"
          />
          <div className="flex min-w-0 flex-1 flex-col text-left">
            <span className="truncate text-sm font-semibold text-[var(--fg-default)]">
              {member.summary.displayName}
              {member.isCurrentUser ? " (You)" : ""}
            </span>
            <span className="truncate text-[10px] uppercase tracking-[0.24em] text-[var(--fg-muted)]">
              {lastSeenLabel}
            </span>
          </div>
        </button>
        {profileZapEndpoint && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleMemberZap(member.pubkey, member.summary, profileZapEndpoint)}
              disabled={profileZapPending}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                profileZapPending
                  ? "border-brand text-brand"
                  : canZap
                    ? "border-brand/40 text-brand hover:border-brand"
                    : "border-dashed border-[var(--border-subtle)] text-[var(--fg-muted)]"
              } disabled:cursor-not-allowed disabled:opacity-60`}
              title={profileZapTitle}
            >
              {profileZapPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              <span className="sr-only">Zap {member.summary.displayName}</span>
            </button>
            {profileZapDisplayCount > 0 && (
              <span className="text-[10px] font-semibold text-brand">
                {profileZapDisplayCount.toLocaleString()}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSuggestedMember = (member: MemberListEntry) => {
    const lastSeenLabel = member.lastSeen > 0 ? formatLastSeenLabel(member.lastSeen) : "No recent activity";
    return (
      <div
        key={`suggested-${member.pubkey}`}
        className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 px-4 py-3 shadow-sm"
      >
        <button
          type="button"
          onClick={() => openProfile(member.pubkey)}
          className="flex flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <img
            src={member.summary.avatarUrl}
            alt={member.summary.displayName}
            className="h-10 w-10 rounded-full border border-[var(--border-subtle)] object-cover shadow-sm"
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-[var(--fg-default)]">{member.summary.displayName}</span>
            <span className="truncate text-[10px] uppercase tracking-[0.24em] text-[var(--fg-muted)]">{lastSeenLabel}</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => follow(member.pubkey)}
          className="inline-flex items-center justify-center rounded-full border border-brand/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-brand transition hover:border-brand hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          Follow
        </button>
      </div>
    );
  };

  useEffect(() => {
    const entries = new Map<string, number>();
    feedPosts.forEach((post) => {
      entries.set(`feed:${post.id}`, countZapReferences(post.tags));
    });
    messages.forEach((message) => {
      entries.set(`chat:${message.id}`, 0);
    });
    contextMembers.forEach((member) => {
      entries.set(`profile:${member.pubkey}`, 0);
    });

    setZapCounts((prev) => {
      let changed = false;
      const next: Record<string, number> = {};
      entries.forEach((base, key) => {
        const current = prev[key];
        const value = current === undefined ? base : Math.max(current, base);
        if (value !== current) {
          changed = true;
        }
        if (current === undefined) {
          changed = true;
        }
        next[key] = value;
      });
      if (Object.keys(prev).length !== entries.size) {
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [feedPosts, messages, contextMembers]);

  useEffect(() => {
    const validKeys = new Set<string>();
    feedPosts.forEach((post) => validKeys.add(`feed:${post.id}`));
    messages.forEach((message) => validKeys.add(`chat:${message.id}`));
    contextMembers.forEach((member) => validKeys.add(`profile:${member.pubkey}`));

    setPendingZaps((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((key) => {
        if (validKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      });
      if (!changed && next.size === prev.size) {
        return prev;
      }
      return next;
    });
  }, [feedPosts, messages, contextMembers]);

  const authorAccents = useMemo(() => {
    const map = new Map<string, AuthorAccent>();
    messages.forEach((message) => {
      if (!map.has(message.pubkey)) {
        map.set(message.pubkey, computeAuthorAccent(message.pubkey));
      }
      if (message.quotePubkey && !map.has(message.quotePubkey)) {
        map.set(message.quotePubkey, computeAuthorAccent(message.quotePubkey));
      }
    });
    return map;
  }, [messages]);
  const messagesById = useMemo(() => {
    const map = new Map<string, CasualChatMessage>();
    messages.forEach((message) => {
      map.set(message.id, message);
    });
    return map;
  }, [messages]);
  const messageIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    messages.forEach((message, index) => {
      map.set(message.id, index);
    });
    return map;
  }, [messages]);
  const typingSummaries = useMemo(
    () =>
      typingPubkeys
        .filter((key) => key !== pubkey)
        .map((key) => resolveProfileSummary(key)),
    [typingPubkeys, pubkey, resolveProfileSummary],
  );
  const membersHeading = isCasualView
    ? "Casual Chat members"
    : isPublicFeedView
      ? "Public Feed members"
      : isPersonalFeedView
        ? "Your Feed members"
        : "Community members";
  const hasFollowingMembers = followingMemberEntries.length > 0;
  const hasOtherOnlineMembers = otherOnlineMemberEntries.length > 0;
  const visibleFollowingCount = displayedFollowingMembers.length;
  const visibleOtherOnlineCount = displayedOtherOnlineMembers.length;

  const memberListContent =
    !currentMemberEntry && !hasFollowingMembers && !hasOtherOnlineMembers ? (
      <p className="rounded-2xl bg-[var(--bg-card)]/70 p-4 text-xs text-[var(--fg-muted)] shadow-sm">
        We&apos;ll show members here as soon as there&apos;s activity.
      </p>
    ) : (
      <div className="space-y-6">
        {currentMemberEntry && (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]">You</h3>
            <div className="mt-3 space-y-3">{renderMemberRow(currentMemberEntry)}</div>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]">
              People you follow
            </h3>
            {hasFollowingMembers && (
              <span className="text-[9px] uppercase tracking-[0.24em] text-[var(--fg-muted)]">
                {`${visibleFollowingCount.toLocaleString()} / ${followingMemberEntries.length.toLocaleString()}`}
              </span>
            )}
          </div>
          {hasFollowingMembers ? (
            <div className="mt-3 space-y-3">{displayedFollowingMembers.map((member) => renderMemberRow(member))}</div>
          ) : (
            <p className="mt-3 rounded-2xl bg-[var(--bg-card)]/70 p-4 text-xs text-[var(--fg-muted)] shadow-sm">
              Follow community members to see them here.
            </p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]">
              Other online users
            </h3>
            {hasOtherOnlineMembers && (
              <span className="text-[9px] uppercase tracking-[0.24em] text-[var(--fg-muted)]">
                {`${visibleOtherOnlineCount.toLocaleString()} / ${otherOnlineMemberEntries.length.toLocaleString()}`}
              </span>
            )}
          </div>
          {hasOtherOnlineMembers ? (
            <div className="mt-3 space-y-3">{displayedOtherOnlineMembers.map((member) => renderMemberRow(member))}</div>
          ) : (
            <p className="mt-3 rounded-2xl bg-[var(--bg-card)]/70 p-4 text-xs text-[var(--fg-muted)] shadow-sm">
              No one else is online right now.
            </p>
          )}
        </div>
        {hasMoreMembers && (
          <div className="text-center text-[9px] uppercase tracking-[0.3em] text-[var(--fg-muted)]">
            Scroll to load more people
          </div>
        )}
      </div>
    );
  const renderTabButton = (tab: ViewTab, variant: "mobile" | "desktop") => {
    const Icon = tab.icon;
    const isActive = activeView === tab.key;
    const tabId = `community-tab-${tab.key}`;
    const panelId = `community-panel-${tab.key}`;
    const layoutClass = variant === "mobile" ? "min-w-[10rem] shrink-0 snap-start" : "w-full";
    const baseClasses =
      "flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 sm:text-sm";
    const paletteClasses = isActive
      ? "border-brand bg-brand/10 text-brand shadow-sm"
      : "border-transparent text-[var(--fg-muted)] hover:border-brand hover:text-brand";
    return (
      <button
        key={tab.key}
        type="button"
        id={tabId}
        role="tab"
        aria-selected={isActive}
        aria-controls={panelId}
        tabIndex={isActive ? 0 : -1}
        onClick={() => {
          setActiveView(tab.key);
        }}
        className={`${baseClasses} ${layoutClass} ${paletteClasses}`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>{tab.label}</span>
      </button>
    );
  };
  const totalSize = useMemo(() => {
    void virtualVersion;
    let total = 0;
    messages.forEach((message) => {
      total += rowHeightsRef.current.get(message.id) ?? estimatedRowHeight;
    });
    return total;
  }, [messages, virtualVersion]);
  const virtualItems = useMemo(() => {
    void virtualVersion;
    if (!isCasualView) return [];
    const node = listRef.current;
    const scrollTop = node?.scrollTop ?? 0;
    const viewportHeight = node?.clientHeight ?? 0;
    const overscan = 6;

    const offsets: number[] = [];
    let runningOffset = 0;
    messages.forEach((message) => {
      offsets.push(runningOffset);
      runningOffset += rowHeightsRef.current.get(message.id) ?? estimatedRowHeight;
    });

    let startIndex = 0;
    for (let i = 0; i < messages.length; i += 1) {
      const height = rowHeightsRef.current.get(messages[i].id) ?? estimatedRowHeight;
      if (offsets[i] + height > scrollTop) {
        startIndex = Math.max(0, i - overscan);
        break;
      }
      if (i === messages.length - 1) {
        startIndex = Math.max(0, i - overscan);
      }
    }

    let endIndex = startIndex;
    for (let i = startIndex; i < messages.length; i += 1) {
      const height = rowHeightsRef.current.get(messages[i].id) ?? estimatedRowHeight;
      const start = offsets[i];
      const end = start + height;
      endIndex = i;
      if (end > scrollTop + viewportHeight) {
        endIndex = Math.min(messages.length - 1, i + overscan);
        break;
      }
    }

    const items = [];
    for (let i = startIndex; i <= endIndex && i < messages.length; i += 1) {
      items.push({ index: i, start: offsets[i] });
    }
    return items;
  }, [estimatedRowHeight, isCasualView, messages, virtualVersion]);
  const stickyDateLabel = useMemo(() => {
    if (!isCasualView || virtualItems.length === 0) {
      return null;
    }
    const firstVisible = messages[virtualItems[0].index];
    if (!firstVisible) {
      return null;
    }
    return formatDateLabel(firstVisible.created_at);
  }, [isCasualView, messages, virtualItems]);
  const showJumpToLatest = isCasualView && !isAtTop && messages.length > 0;

  const handleUploadFile = useCallback(
    async (file: File) => {
      const result = await uploadFile(file);
      const preview = latestPreview ?? result.previewUrl ?? (await getCachedPreview(roomId, result.digest));
      setPendingAttachments((prev) => [
        ...prev,
        {
          ...result,
          previewUrl: preview ?? null,
        },
      ]);
      resetUpload();
    },
    [latestPreview, resetUpload, roomId, uploadFile],
  );

  const handleRemoveAttachment = useCallback((cacheKey: string) => {
    setPendingAttachments((prev) => prev.filter((item) => item.cacheKey !== cacheKey));
  }, []);

  const handleSend = useCallback(
    async (text: string, options?: { quoteId?: string | null; quotePubkey?: string | null }) => {
      const attachments: CasualAttachmentMeta[] = pendingAttachments.map((attachment) => ({
        eventId: attachment.eventId,
        url: attachment.url,
        mimeType: attachment.mimeType,
        size: attachment.size,
        width: attachment.width,
        height: attachment.height,
        digest: attachment.digest,
        iv: attachment.iv,
      }));
      await sendMessage(text, attachments, options);
      setPendingAttachments([]);
      setComposerError(null);
    },
    [pendingAttachments, sendMessage],
  );

  const handleComposerSend = useCallback(
    async (text: string) => {
      try {
        const quoteId = quoteContext?.id ?? null;
        const quotePubkey = quoteContext?.pubkey ?? null;
        await handleSend(text, { quoteId, quotePubkey });
        setComposerDraft(undefined);
        setQuoteContext(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setComposerError(message);
        throw error;
      }
    },
    [handleSend, quoteContext],
  );

  const handleQuoteMessage = useCallback((message: CasualChatMessage) => {
    setComposerDraft("");
    const summary = resolveProfileSummary(message.pubkey);
    setQuoteContext({
      id: message.id,
      pubkey: message.pubkey,
      createdAt: message.created_at,
      displayName: summary.displayName,
      snippet: buildQuoteSnippet(message.markdown),
    });
  }, [resolveProfileSummary]);

  const startHighlight = useCallback((messageId: string) => {
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
    }
    setHighlightedMessageId(messageId);
    if (typeof window !== "undefined") {
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedMessageId(null);
        highlightTimerRef.current = null;
      }, 2000);
    }
  }, []);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    },
    [],
  );

  useEffect(
    () => () => {
      resizeObserversRef.current.forEach((observer) => observer.disconnect());
      resizeObserversRef.current.clear();
    },
    [],
  );

  const handleScrollToMessage = useCallback(
    (messageId: string) => {
      const index = messageIndexMap.get(messageId);
      if (index === undefined) return;
      const node = messageRefs.current.get(messageId);
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        startHighlight(messageId);
        return;
      }
      const container = listRef.current;
      if (!container) return;
      let offset = 0;
      for (let i = 0; i < messages.length; i += 1) {
        const current = messages[i];
        if (current.id === messageId) {
          break;
        }
        offset += rowHeightsRef.current.get(current.id) ?? estimatedRowHeight;
      }
      pendingHighlightRef.current = messageId;
      container.scrollTo({ top: offset, behavior: "smooth" });
    },
    [estimatedRowHeight, messageIndexMap, messages, startHighlight],
  );

  const handleLikeMessage = useCallback(
    async (message: CasualChatMessage) => {
      try {
        await sendMessage(`❤️ ${shortenPubkey(message.pubkey)}`);
      } catch (reactionError) {
        const messageText = reactionError instanceof Error ? reactionError.message : String(reactionError);
        setComposerError(messageText);
      }
    },
    [sendMessage],
  );

  const registerRow = useCallback(
    (messageId: string) => (node: HTMLDivElement | null) => {
      const observers = resizeObserversRef.current;
      const existing = observers.get(messageId);
      if (existing) {
        existing.disconnect();
        observers.delete(messageId);
      }
      if (node) {
        messageRefs.current.set(messageId, node);
        const measure = () => {
          const height = node.getBoundingClientRect().height;
          if (height > 0 && rowHeightsRef.current.get(messageId) !== height) {
            rowHeightsRef.current.set(messageId, height);
            setVirtualVersion((value) => value + 1);
          }
        };
        measure();
        if (typeof ResizeObserver !== "undefined") {
          const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            const height =
              entry?.borderBoxSize?.[0]?.blockSize ?? entry?.contentRect?.height ?? node.getBoundingClientRect().height;
            if (height > 0 && rowHeightsRef.current.get(messageId) !== height) {
              rowHeightsRef.current.set(messageId, height);
              setVirtualVersion((value) => value + 1);
            }
          });
          observer.observe(node);
          observers.set(messageId, observer);
        }
        if (pendingHighlightRef.current === messageId) {
          pendingHighlightRef.current = null;
          startHighlight(messageId);
        }
      } else {
        messageRefs.current.delete(messageId);
      }
    },
    [setVirtualVersion, startHighlight],
  );

  const gatingResult = renderContent();
  if (gatingResult) {
    return gatingResult;
  }

  const chatListFallback = (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div
        role="alert"
        className="rounded-3xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500 shadow-sm"
      >
        We couldn&apos;t load chat messages. Please refresh the page.
      </div>
    </div>
  );

  const feedFallback = (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div
        role="alert"
        className="rounded-3xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500 shadow-sm"
      >
        We couldn&apos;t load the community feed. Please refresh and try again.
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-[var(--bg-app)] transition-colors">
      <div
        className="pointer-events-none absolute inset-0 transition-[background-image] duration-300"
        style={{ backgroundImage: backgroundTexture }}
        aria-hidden="true"
      />
      <div className="relative z-0 flex min-h-screen w-full flex-col">
        <aside className="hidden border-r border-[var(--border-subtle)] bg-[var(--bg-card)]/70 px-5 py-8 backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-80 lg:flex-col">
          <nav
            aria-label="Community navigation"
            role="tablist"
            className="flex flex-col gap-2"
          >
            {DESKTOP_VIEW_TABS.map((tab) => renderTabButton(tab, "desktop"))}
          </nav>
          <div className="mt-8 flex-1 overflow-hidden">
            <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)]">{membersHeading}</h2>
            <div ref={memberScrollRef} className="mt-5 h-full overflow-y-auto pr-1">
              {memberListContent}
            </div>
          </div>
        </aside>
        <div className="flex flex-1 min-h-0 flex-col lg:pl-80">
          <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/80 px-5 py-4 backdrop-blur lg:hidden">
            <nav
              aria-label="Community navigation"
              role="tablist"
              className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-2 text-sm scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {MOBILE_VIEW_TABS.map((tab) => renderTabButton(tab, "mobile"))}
            </nav>
          </div>
          <main className="relative flex flex-1 min-h-0 flex-col">
            <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/60 px-5 py-3 text-[10px] uppercase tracking-[0.24em] text-[var(--fg-muted)] sm:px-8">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--fg-muted)]">
                <Languages className="h-4 w-4 text-brand" aria-hidden="true" />
                <span>
                  Auto-translate: <span className="text-brand">{targetLanguageLabel}</span>
                </span>
              </div>
              <button
                type="button"
                aria-pressed={autoTranslateEnabled}
                onClick={() => setAutoTranslateEnabled(!autoTranslateEnabled)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                  autoTranslateEnabled
                    ? "border-brand/50 text-brand hover:border-brand"
                    : "border-[var(--border-subtle)] text-[var(--fg-muted)] hover:border-brand hover:text-brand"
                }`}
              >
                {autoTranslateEnabled ? "Turn off" : "Turn on"} translation
              </button>
            </div>
            {isCasualView ? (
              <section
                id="community-panel-casual"
                role="tabpanel"
                aria-labelledby="community-tab-casual"
                className="relative flex flex-1 min-h-0 flex-col"
              >
                {stickyDateLabel && (
                  <div className="pointer-events-none absolute left-0 right-0 top-24 z-20 px-4 sm:top-20">
                    <div className="mx-auto max-w-3xl">
                      <div className="w-full rounded-full bg-[var(--bg-card)]/90 px-4 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)] shadow-sm backdrop-blur sm:w-fit">
                        {stickyDateLabel}
                      </div>
                    </div>
                  </div>
                )}
                {showJumpToLatest && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewMessageAnchor(null);
                      scrollToTop("smooth");
                    }}
                    className="pointer-events-auto absolute bottom-28 right-6 z-30 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-brand sm:bottom-36 sm:right-10"
                    style={jumpButtonStyle}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                    Jump to latest
                  </button>
                )}
                <ErrorBoundary fallback={chatListFallback}>
                  <div
                    ref={listRef}
                    className="relative flex-1 overflow-y-auto overscroll-y-contain"
                    style={{ scrollPaddingBottom: chatSpacing.scrollPadding }}
                  >
                    <div
                      className="px-4 pt-6 sm:px-8"
                      style={{ paddingBottom: chatSpacing.contentPadding }}
                    >
                      <div
                        style={{ height: `${totalSize}px`, position: "relative" }}
                      >
                        {virtualItems.map((virtualRow) => {
                          const message = messages[virtualRow.index];
                          if (!message) return null;
                          const previousMessage =
                            virtualRow.index > 0 ? messages[virtualRow.index - 1] : null;
                          const showDateDivider =
                            !previousMessage ||
                            getDateKey(previousMessage.created_at) !== getDateKey(message.created_at);
                          const isSelf = message.pubkey === pubkey;
                          const accent = authorAccents.get(message.pubkey);
                          const summary = resolveProfileSummary(message.pubkey);
                          const timestampColor = isSelf ? "text-white/80" : "text-[var(--fg-muted)]";
                          const referencedMessage = message.quoteId ? messagesById.get(message.quoteId) : undefined;
                          const quoteAccentSource = message.quotePubkey ?? referencedMessage?.pubkey ?? undefined;
                          const quoteAccent =
                            quoteAccentSource
                              ? authorAccents.get(quoteAccentSource) ?? computeAuthorAccent(quoteAccentSource)
                              : undefined;
                          const quotedSummary = message.quotePubkey
                            ? resolveProfileSummary(message.quotePubkey)
                            : referencedMessage
                              ? resolveProfileSummary(referencedMessage.pubkey)
                              : null;
                          const isHighlighted = highlightedMessageId === message.id;
                          const messageZapKey = `chat:${message.id}`;
                          const messageZapEndpoint = isSelf
                            ? null
                            : detectZapEndpoint({
                                lightningAddress: summary.lightningAddress,
                                tags: message.tags,
                              });
                          const baseMessageZapCount = zapCounts[messageZapKey] ?? 0;
                          const messageZapPending = pendingZaps.has(messageZapKey);
                          const messageZapDisplayCount = Math.max(
                            0,
                            baseMessageZapCount + (messageZapPending ? 1 : 0),
                          );
                          const messageZapTitle = !messageZapEndpoint
                            ? "Zaps unavailable"
                            : messageZapPending
                              ? "Sending zap…"
                              : canZap
                                ? "Zap this message"
                                : "Preparing your Nostr keys…";
                          const messageSnippet = buildQuoteSnippet(message.markdown);
                          const translationKey = messageZapKey;
                          const translationEntry = getTranslation(translationKey);
                          const translationStatus = translationEntry?.status ?? "idle";
                          const rawTranslatedText =
                            translationEntry?.translatedText &&
                            translationEntry.translatedText.trim().length > 0
                              ? translationEntry.translatedText
                              : null;
                          const translationReady = translationStatus === "ready" && !!rawTranslatedText;
                          const showOriginal =
                            !autoTranslateEnabled ||
                            !translationReady ||
                            isOriginalVisible(translationKey);
                          const translatedHtml =
                            translationReady && rawTranslatedText ? markdownToHtml(rawTranslatedText) : null;
                          const renderedHtml =
                            !showOriginal && translatedHtml ? translatedHtml : message.html;
                          const detectedLanguageLabel =
                            translationEntry?.detectedLanguage &&
                            translationEntry.detectedLanguage.trim().length > 0
                              ? formatLanguageName(translationEntry.detectedLanguage)
                              : null;
                          const translationNoticeColor = isSelf
                            ? "text-white/70"
                            : "text-[var(--fg-muted)]";
                          return (
                            <div
                              key={message.id}
                              data-index={virtualRow.index}
                              ref={registerRow(message.id)}
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                transform: `translateY(${virtualRow.start}px)`,
                              }}
                              className="pb-4"
                            >
                              {showDateDivider && (
                                <div className="mb-4">
                                  <div className="mx-auto w-full rounded-full bg-[var(--bg-card)]/90 px-4 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)] shadow-sm backdrop-blur sm:w-fit">
                                    {formatDateLabel(message.created_at)}
                                  </div>
                                </div>
                              )}
                              {newMessageAnchor === message.id && (
                                <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-brand">
                                  <span className="h-px flex-1 bg-brand/40" />
                                  <span>New messages</span>
                                  <span className="h-px flex-1 bg-brand/40" />
                                </div>
                              )}
                              <div className={`flex w-full ${isSelf ? "justify-end" : "justify-start"} py-2`}>
                                <div className={`flex max-w-[min(80%,32rem)] items-end gap-3 ${isSelf ? "flex-row-reverse" : ""}`}>
                                <button
                                  type="button"
                                  onClick={() => openProfile(message.pubkey)}
                                  className="group flex-shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                                >
                                  <img
                                    src={summary.avatarUrl}
                                    alt={summary.displayName}
                                    className="h-10 w-10 rounded-full border border-white/80 object-cover shadow-sm transition group-hover:ring-2 group-hover:ring-brand dark:border-neutral-700"
                                  />
                                  <span className="sr-only">Open profile</span>
                                </button>
                                <div
                                  className={`space-y-3 rounded-3xl border px-4 py-3 backdrop-blur ${
                                    isSelf
                                      ? "bg-brand text-white shadow-xl border-brand/60"
                                      : "bg-white/85 text-[var(--fg-default)] shadow-sm dark:bg-neutral-900/70"
                                  } ${isHighlighted ? "ring-2 ring-brand/70" : "ring-1 ring-transparent"}`}
                                  style={
                                    !isSelf && accent
                                      ? { borderColor: accent.border, boxShadow: `0 18px 36px ${accent.shadow}` }
                                      : undefined
                                  }
                                >
                                  {message.quoteId && (
                                    <button
                                      type="button"
                                      onClick={() => handleScrollToMessage(message.quoteId!)}
                                      className="group flex w-full items-start gap-3 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-white/80 px-3 py-2 text-left text-xs transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 dark:bg-neutral-900/60"
                                    >
                                      <span
                                        aria-hidden
                                        className="mt-1 inline-flex h-2 w-2 flex-shrink-0 rounded-full"
                                        style={{ backgroundColor: quoteAccent?.dot ?? accent?.dot }}
                                      />
                                      <div className="flex-1">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)] group-hover:text-brand">
                                          {quotedSummary?.displayName ?? "Quoted member"}
                                        </p>
                                        <p className="mt-1 text-[11px] text-[var(--fg-default)] group-hover:text-brand">
                                          {referencedMessage
                                            ? buildQuoteSnippet(referencedMessage.markdown)
                                            : "Original message unavailable"}
                                        </p>
                                        <p
                                          className={`mt-2 text-[9px] uppercase tracking-[0.3em] ${
                                            isSelf ? "text-white/70" : "text-[var(--fg-muted)]"
                                          }`}
                                        >
                                          {referencedMessage ? formatTimestamp(referencedMessage.created_at) : ""}
                                        </p>
                                      </div>
                                    </button>
                                  )}
                                  <div
                                    className={`prose prose-sm max-w-none whitespace-pre-wrap break-words ${
                                      isSelf ? "prose-invert" : "text-[var(--fg-default)]"
                                    } prose-a:text-brand`}
                                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                                  />
                                  {autoTranslateEnabled && (
                                    <div
                                      className={`flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.3em] ${translationNoticeColor}`}
                                    >
                                      {translationStatus === "loading" ? (
                                        <span>Translating…</span>
                                      ) : translationStatus === "error" ? (
                                        <>
                                          <span>Translation unavailable</span>
                                          <button
                                            type="button"
                                            onClick={() => refreshTranslation(translationKey, message.markdown)}
                                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.3em] transition focus-visible:outline-none focus-visible:ring-1 ${
                                              isSelf
                                                ? "text-white hover:text-white focus-visible:ring-white/60"
                                                : "text-brand hover:text-brand/80 focus-visible:ring-brand/60"
                                            }`}
                                          >
                                            Retry
                                          </button>
                                        </>
                                      ) : translationReady ? (
                                        <>
                                          <span>
                                            {showOriginal
                                              ? `Showing original${
                                                  detectedLanguageLabel ? ` (${detectedLanguageLabel})` : ""
                                                }`
                                              : `Translated from ${detectedLanguageLabel ?? "original language"}`}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => toggleOriginal(translationKey)}
                                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.3em] transition focus-visible:outline-none focus-visible:ring-1 ${
                                              isSelf
                                                ? "text-white hover:text-white focus-visible:ring-white/60"
                                                : "text-brand hover:text-brand/80 focus-visible:ring-brand/60"
                                            }`}
                                          >
                                            {showOriginal ? "View translation" : "View original"}
                                          </button>
                                        </>
                                      ) : null}
                                    </div>
                                  )}
                                  {message.attachments.length > 0 && (
                                    <div className="space-y-3">
                                      {message.attachments.map((attachment) => (
                                        <div
                                          key={`${message.id}-${attachment.digest ?? attachment.url}`}
                                          className="overflow-hidden rounded-2xl border border-white/40 bg-black/10"
                                        >
                                          <AttachmentPreview attachment={attachment} />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div className={`flex items-center gap-2 ${isSelf ? "justify-end" : ""}`}>
                                    <button
                                      type="button"
                                      onClick={() => handleQuoteMessage(message)}
                                      disabled={!ready}
                                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                                        isSelf
                                          ? "border-white/60 text-white"
                                          : "border-white/70 text-[var(--fg-muted)] hover:border-brand hover:text-brand"
                                      } disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60`}
                                      title="Quote"
                                    >
                                      <MessageSquareQuote className="h-4 w-4" />
                                      <span className="sr-only">Quote</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleLikeMessage(message)}
                                      disabled={!ready}
                                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                                        isSelf
                                          ? "border-white/60 text-white hover:border-white"
                                          : "border-white/70 text-[var(--fg-muted)] hover:border-brand hover:text-brand"
                                      } disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60`}
                                      title="Send a like"
                                    >
                                      <Heart className="h-4 w-4" />
                                      <span className="sr-only">Like</span>
                                    </button>
                                    {messageZapEndpoint && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleOpenZap({
                                              key: messageZapKey,
                                              context: "chat",
                                              endpoint: messageZapEndpoint,
                                              authorPubkey: message.pubkey,
                                              noteId: message.id,
                                              relays: extractRelaysFromTags(message.tags),
                                              summary,
                                              snippet: messageSnippet,
                                            })
                                          }
                                          disabled={messageZapPending}
                                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                                            messageZapPending
                                              ? "border-brand text-white dark:text-brand"
                                              : canZap
                                                ? "border-brand/40 text-white hover:border-brand dark:text-brand"
                                                : "border-dashed border-white/60 text-white/80 dark:text-[var(--fg-muted)]"
                                          } disabled:cursor-not-allowed disabled:opacity-60`}
                                          title={messageZapTitle}
                                        >
                                          {messageZapPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <Zap className="h-4 w-4" />
                                          )}
                                          <span className="sr-only">Zap {summary.displayName}</span>
                                        </button>
                                        {messageZapDisplayCount > 0 && (
                                          <span className="text-[10px] font-semibold text-brand">
                                            {messageZapDisplayCount.toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  {message.status === "pending" && (
                                    <p className={`text-[10px] uppercase tracking-[0.24em] ${timestampColor}`}>Sending…</p>
                                  )}
                                  {message.status === "failed" && (
                                    <p className="text-[10px] uppercase tracking-[0.24em] text-red-200 dark:text-red-400">
                                      {message.error ?? "We couldn't deliver this message."}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                        })}
                      </div>
                    </div>
                  </div>
                </ErrorBoundary>
                <div
                  ref={composerContainerRef}
                  className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4 backdrop-blur sm:px-8 lg:left-80"
                >
                  <div className="mx-auto w-full max-w-3xl space-y-3">
                    {typingSummaries.length > 0 && (
                      <div className="flex justify-center">
                        <div className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-card)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--fg-muted)]">
                          {`${typingSummaries.map((entry) => entry.displayName).join(", ")} typing…`}`
                        </div>
                      </div>
                    )}
                    {roomKeyError && <p className="text-sm text-red-500">{roomKeyError}</p>}
                    {sendError && <p className="text-sm text-red-500">{sendError}</p>}
                    {composerError && <p className="text-sm text-red-500">{composerError}</p>}
                    <Composer
                      disabled={!ready}
                      onSend={handleComposerSend}
                      onUploadFile={handleUploadFile}
                      pendingAttachments={pendingAttachments}
                      onRemoveAttachment={handleRemoveAttachment}
                      uploadStatus={uploadStatus}
                      uploadProgress={uploadProgress}
                      uploadError={uploadError}
                      draft={composerDraft}
                      onTyping={sendTyping}
                      quoteContext={quoteContext}
                      onClearQuote={() => setQuoteContext(null)}
                      onJumpToQuote={handleScrollToMessage}
                    />
                  </div>
                </div>
              </section>
            ) : isPublicFeedView ? (
              <section
                id="community-panel-feed"
                role="tabpanel"
                aria-labelledby="community-tab-feed"
                className="flex flex-1 min-h-0"
                >
                  <ErrorBoundary fallback={feedFallback}>
                    <div className="flex h-full flex-1 min-h-0 overflow-hidden">
                      <BitcoinSquareFeed
                        posts={feedPosts}
                        ready={feedReady}
                        publishing={feedPublishing}
                        publishStatus={publishFeedStatus}
                        likePost={likeFeedPost}
                        loadMore={loadMoreFeed}
                        loadingMore={feedLoadingMore}
                        hasMore={feedHasMore}
                        error={feedError}
                        canZap={canZap}
                        pubkey={feedPubkey}
                        initialLoading={feedInitialLoading}
                        onZapRequest={handleFeedZapRequest}
                        zapCounts={zapCounts}
                        pendingZaps={pendingZaps}
                      />
                    </div>
                  </ErrorBoundary>
                </section>
            ) : isPersonalFeedView ? (
              <section
                id="community-panel-personal"
                role="tabpanel"
                aria-labelledby="community-tab-personal"
                className="flex flex-1 min-h-0"
              >
                <ErrorBoundary fallback={feedFallback}>
                  <div className="flex h-full flex-1 min-h-0 overflow-hidden">
                    {hasFollowing ? (
                      <BitcoinSquareFeed
                        posts={personalFeedPosts}
                        ready={feedReady}
                        publishing={feedPublishing}
                        publishStatus={publishFeedStatus}
                        likePost={likeFeedPost}
                        loadMore={loadMoreFeed}
                        loadingMore={feedLoadingMore}
                        hasMore={feedHasMore}
                        error={feedError}
                        canZap={canZap}
                        pubkey={feedPubkey}
                        initialLoading={feedInitialLoading}
                        onZapRequest={handleFeedZapRequest}
                        zapCounts={zapCounts}
                        pendingZaps={pendingZaps}
                      />
                    ) : (
                      <div className="flex flex-1 items-center justify-center px-6 py-12">
                        <div className="w-full max-w-lg space-y-6 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/80 p-6 text-center shadow-xl">
                          <h2 className="text-lg font-semibold text-[var(--fg-default)]">Build your feed</h2>
                          <p className="text-sm text-[var(--fg-muted)]">
                            Follow community members to see their updates in Your Feed.
                          </p>
                          {recommendedMembers.length > 0 ? (
                            <div className="space-y-4 text-left">
                              <p className="text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)] sm:text-left">
                                Suggested members
                              </p>
                              <div className="space-y-3">
                                {recommendedMembers.map((member) => renderSuggestedMember(member))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-[var(--fg-muted)]">
                              Browse the Public Feed to discover people to follow.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </ErrorBoundary>
              </section>
            ) : (
              <section
                id="community-panel-members"
                role="tabpanel"
                aria-labelledby="community-tab-members"
                className="flex flex-1 flex-col"
              >
                <div className="flex flex-1 flex-col overflow-hidden px-5 py-6 sm:px-8">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)]">
                    {membersHeading}
                  </h2>
                  <div ref={memberScrollRef} className="mt-5 flex-1 overflow-y-auto pr-1">
                    {memberListContent}
                  </div>
                </div>
              </section>
            )}
          </main>
        </div>
      </div>

      {walletPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8">
          <div className="w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 text-center shadow-2xl">
            <h2 className="text-lg font-semibold text-[var(--fg-default)]">Connect your Lightning wallet</h2>
            <p className="mt-3 text-sm text-[var(--fg-muted)]">
              Add a Lightning address on your dashboard so you can zap other members instantly.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-semibold uppercase tracking-[0.24em] text-white transition hover:bg-brand/90"
              >
                Open dashboard
              </a>
              <button
                type="button"
                onClick={() => setWalletPromptOpen(false)}
                className="inline-flex items-center justify-center rounded-full border border-[var(--border-subtle)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <ZapDialog
        open={zapState.open}
        target={zapState.target}
        stage={zapState.stage}
        lnurl={zapState.lnurl}
        lnurlLoading={zapState.lnurlLoading}
        amountSats={zapState.amountSats}
        invoice={zapState.invoice}
        error={zapState.error}
        weblnTried={zapState.weblnTried}
        onClose={handleZapClose}
        onSubmit={handleSubmitZap}
        onRetry={handleZapRetry}
        onMarkPaid={handleZapMarkPaid}
      />
    </div>
  );
};

const Community: React.FC = () => (
  <CommunityTranslationProvider>
    <CommunityView />
  </CommunityTranslationProvider>
);

export default Community;
