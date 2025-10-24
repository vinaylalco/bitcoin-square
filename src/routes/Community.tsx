import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";

import BitcoinSquareFeed from "../components/bitcoinSquareChat/BitcoinSquareFeed";
import ErrorBoundary from "../components/ErrorBoundary";
import type { RoomDefinition } from "../components/RoomList";
import {
  CASUAL_ROOM_ID,
  CASUAL_ROOM_NAME,
  useBitcoinSquareCasualChat,
  type CasualChatMessage,
} from "../hooks/useBitcoinSquareCasualChat";
import type { CasualAttachmentMeta } from "../hooks/useBitcoinSquareCasualChat";
import { useBitcoinSquareFeed } from "../hooks/useBitcoinSquareFeed";
import type { FeedPost } from "../hooks/useBitcoinSquareFeed";
import { decryptBinary } from "../utils/aes";
import { getCachedMediaBlob, getCachedPreview, setCachedMediaBlob, setCachedPreview } from "../utils/mediaCache";
import { useProfileIdentity } from "../context/ProfileIdentityContext";
import type { ProfileSummary } from "../context/ProfileIdentityContext";
import { useAuth } from "../context/AuthContext";
import { useNostrAccount } from "../hooks/useNostrAccount";
import { nostrClient, setNostrClientSigner } from "../lib/nostrClient";
import { useTheme } from "../context/ThemeContext";
import {
  CommunityTranslationProvider,
  useCommunityTranslation,
} from "../context/CommunityTranslationContext";
import { useDirectMessages } from "../context/DirectMessageContext";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  Bell,
  Heart,
  ImagePlus,
  Loader2,
  MessageCircle,
  MessageSquareQuote,
  Newspaper,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  extractMarkdownImageUrls as getMarkdownImageUrls,
  markdownToHtml,
} from "../utils/markdown";
import {
  createPlaceholderImageDetails,
  uploadImageViaWorker,
  validateImageFile,
  type UploadedImageDetails,
} from "../utils/imageUpload";
import { rewriteImgBbUrlToProxy, rewriteImgBbUrlsInText } from "../utils/imageProxy";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import {
  extractMentionedPubkeys,
  includesMentionOfPubkey,
  type MentionTarget,
} from "../utils/mentions";

type ActiveView = "casual" | "feed" | "personal" | "members";

type ViewTab = { key: ActiveView; label: string; icon: LucideIcon };

const DESKTOP_VIEW_TABS: ViewTab[] = [
  { key: "casual", label: "Chat", icon: MessageCircle },
  { key: "feed", label: "Forum", icon: Newspaper },
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

interface NotificationPreview {
  id: string;
  authorName: string;
  avatarUrl: string;
  snippet: string;
  timestamp: number;
}

type NotificationAction =
  | { kind: "chat"; messageId: string; originalId?: string | null }
  | { kind: "feed"; postId: string; replyId?: string | null };

interface NotificationItem {
  id: string;
  summary: string;
  groupLabel: string;
  timestamp: number;
  previews: NotificationPreview[];
  overflowCount: number;
  action: NotificationAction;
  kind: "chat-reply" | "feed-reply" | "chat-mention" | "feed-mention";
}

const ACTIVE_MEMBER_WINDOW_SECONDS = 60;
const CHAT_CHARACTER_LIMIT = 500;
const LIGHT_BACKGROUND_TEXTURE =
  "radial-gradient(circle at top, rgba(148,163,184,0.16), transparent 60%), radial-gradient(circle at bottom right, rgba(129,140,248,0.12), transparent 55%)";
const DARK_BACKGROUND_TEXTURE =
  "radial-gradient(circle at top, rgba(59,130,246,0.16), transparent 55%), radial-gradient(circle at bottom right, rgba(16,185,129,0.14), transparent 50%)";

// Proxy endpoint served by our Cloudflare Worker to keep upload secrets server-side.
const SITE_UPLOAD_ENDPOINT = "/api/upload";
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_COMPRESSED_SIZE_BYTES = 1 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1080;
const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const QUALITY_STEPS = [0.92, 0.85, 0.75, 0.65, 0.55];

const MEMBER_LIST_INITIAL_LIMIT = 20;
const MEMBER_LIST_PAGE_SIZE = 20;
const MEMBER_SCROLL_THRESHOLD_PX = 120;
const MENTION_SUGGESTION_LIMIT = 6;
const NOTIFICATION_PREVIEW_LIMIT = 3;

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

const extractFeedReplyTargetId = (tags?: string[][] | null): string | null => {
  if (!tags) return null;
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === "reply" && typeof tag[1] === "string" && tag[1].trim().length > 0) {
      return tag[1].trim();
    }
  }
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === "e" && typeof tag[1] === "string" && tag[1].trim().length > 0) {
      return tag[1].trim();
    }
  }
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === "q" && typeof tag[1] === "string" && tag[1].trim().length > 0) {
      return tag[1].trim();
    }
  }
  return null;
};

const formatNameList = (names: string[]): string => {
  const unique = Array.from(new Set(names.filter((name) => typeof name === "string" && name.trim().length > 0))).map((name) =>
    name.trim(),
  );
  if (unique.length === 0) {
    return "Someone";
  }
  if (unique.length === 1) {
    return unique[0];
  }
  if (unique.length === 2) {
    return `${unique[0]} and ${unique[1]}`;
  }
  return `${unique[0]}, ${unique[1]}, and ${unique.length - 2} others`;
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

const extractMarkdownImageUrls = (markdown: string) => {
  const urls = new Set<string>();
  const regex = /!\[[^\]]*\]\(((?:https?:\/\/[^\s)]+|\/?api\/img\/[^\s)]+))\)/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(markdown)) !== null) {
    if (match[1]) {
      urls.add(match[1]);
    }
  }
  return Array.from(urls);
};

const extensionFromMimeType = (type: string) => {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
};

const replaceFileExtension = (name: string, extension: string) => {
  if (!extension) return name;
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base}.${extension}`;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("We couldn't compress the image for upload."));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });

const loadImageElement = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Image uploads are only supported in the browser."));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("We couldn't read that image."));
    };
    image.src = objectUrl;
  });

const createOptimizedImageFile = async (file: File) => {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    throw new Error("Only JPEG, PNG, or WebP images are supported.");
  }
  if (typeof window === "undefined") return file;

  const imageElement = await loadImageElement(file);
  if (
    imageElement.width <= MAX_IMAGE_DIMENSION &&
    imageElement.height <= MAX_IMAGE_DIMENSION &&
    file.size <= MAX_COMPRESSED_SIZE_BYTES
  ) {
    return file;
  }
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(imageElement.width, imageElement.height));
  const targetWidth = Math.max(1, Math.round(imageElement.width * scale));
  const targetHeight = Math.max(1, Math.round(imageElement.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("We couldn't prepare the image for upload.");
  }

  context.drawImage(imageElement, 0, 0, targetWidth, targetHeight);

  const typePriority = (() => {
    if (file.type === "image/png") {
      return ["image/png", "image/webp", "image/jpeg"] as const;
    }
    if (file.type === "image/webp") {
      return ["image/webp", "image/jpeg"] as const;
    }
    return ["image/jpeg", "image/webp"] as const;
  })();

  let bestBlob: Blob | null = null;
  let bestType: string | null = null;

  for (const candidateType of typePriority) {
    const qualities = candidateType === "image/png" ? [undefined] : QUALITY_STEPS;
    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, candidateType, quality);
      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
        bestType = candidateType;
      }
      if (blob.size <= MAX_COMPRESSED_SIZE_BYTES) {
        const extension = extensionFromMimeType(candidateType) ?? "jpg";
        return new File([blob], replaceFileExtension(file.name, extension), { type: candidateType, lastModified: Date.now() });
      }
    }
  }

  if (!bestBlob || !bestType) {
    throw new Error("We couldn't optimize the image for upload.");
  }

  const fallbackExtension = extensionFromMimeType(bestType) ?? "jpg";
  return new File([bestBlob], replaceFileExtension(file.name, fallbackExtension), {
    type: bestType,
    lastModified: Date.now(),
  });
};

const AttachmentPreview: React.FC<{ attachment: CasualAttachmentMeta }> = ({ attachment }) => {
  const [status, setStatus] = useState<AttachmentStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    setLightboxOpen(false);

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

  useEffect(() => {
    if (!lightboxOpen) return;
    if (typeof document === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [lightboxOpen]);

  return (
    <div className="space-y-2">
      {attachment.mimeType.startsWith("image/") && (previewUrl ?? attachment.url) && (
        <button
          type="button"
          onClick={() => {
            if (status === "ready" && fullUrl) {
              setLightboxOpen(true);
            }
          }}
          disabled={status !== "ready" || !fullUrl}
          className={`relative block w-full overflow-hidden rounded-lg border border-[var(--border-subtle)] ${
            status !== "ready" ? "cursor-not-allowed opacity-60" : "cursor-zoom-in"
          }`}
        >
          <img
            src={previewUrl ?? attachment.url}
            alt="Attachment preview"
            className="max-h-48 w-full object-cover"
            loading="lazy"
          />
          <span className="sr-only">View full image</span>
        </button>
      )}
      {status === "ready" && fullUrl && attachment.mimeType.startsWith("video/") && (
        <video src={fullUrl} controls className="max-h-64 w-full rounded-lg" />
      )}
      {status === "loading" && <p className="text-xs text-[var(--fg-muted)]">Loading media…</p>}
      {status === "error" && (
        <p className="text-xs text-red-500">{error ?? "Unable to load media"}</p>
      )}
      {lightboxOpen && fullUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex h-screen w-screen items-center justify-center bg-black/90 p-4 sm:p-10"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setLightboxOpen(false);
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
            <img src={fullUrl} alt="Attachment" className="max-h-full max-w-full object-contain" loading="lazy" />
          </div>
        </div>
      )}
    </div>
  );
};

const Composer: React.FC<{
  disabled: boolean;
  onSend: (
    text: string,
    attachments: CasualAttachmentMeta[],
    options?: { mentionPubkeys?: string[] },
  ) => Promise<void>;
  draft?: string;
  onTyping?: () => void;
  quoteContext?: QuoteContextState | null;
  onClearQuote?: () => void;
  onJumpToQuote?: (messageId: string) => void;
  mentionTargets?: MentionTarget[];
}> = ({
  disabled,
  onSend,
  draft,
  onTyping,
  quoteContext,
  onClearQuote,
  onJumpToQuote,
  mentionTargets = [],
}) => {
  const initialDraft = rewriteImgBbUrlsInText(draft ?? "", { absolute: true });
  const [value, setValue] = useState(initialDraft);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImageDetails[]>(() =>
    getMarkdownImageUrls(initialDraft).map((url) => createPlaceholderImageDetails(url)),
  );
  const [mentionState, setMentionState] = useState<{ active: boolean; start: number; query: string }>(
    { active: false, start: 0, query: "" },
  );
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const typingEmitRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const debouncedMentionQuery = useDebouncedValue(mentionState.query, 300);
  const filteredMentionTargets = useMemo(() => {
    if (!mentionState.active) {
      return [] as MentionTarget[];
    }
    const query = debouncedMentionQuery.trim().toLowerCase();
    const source = mentionTargets.filter((target) => target.pubkey.length === 64);
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
  }, [debouncedMentionQuery, mentionState.active, mentionTargets]);
  const mentionDropdownVisible = mentionState.active && filteredMentionTargets.length > 0;

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

  const emitTyping = useCallback(() => {
    if (!onTyping) return;
    const now = Date.now();
    if (now - typingEmitRef.current < 400) return;
    typingEmitRef.current = now;
    onTyping();
  }, [onTyping]);

  const updateMentionState = useCallback(
    (text: string, caret: number) => {
      if (!mentionTargets.length) {
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
    [closeMention, mentionTargets.length],
  );

  const applyMention = useCallback(
    (target: MentionTarget) => {
      if (!mentionState.active) {
        return;
      }
      const textarea = textareaRef.current;
      const currentValue = textarea ? textarea.value : value;
      const selectionEnd = textarea?.selectionStart ?? currentValue.length;
      const start = mentionState.start;
      if (start < 0 || start > currentValue.length) {
        closeMention();
        return;
      }
      const before = currentValue.slice(0, start);
      const after = currentValue.slice(selectionEnd);
      const mentionText = `@${target.pubkey}`;
      const needsTrailingSpace = after.length === 0 || /^\S/.test(after) ? " " : "";
      const nextValue = `${before}${mentionText}${needsTrailingSpace}${after}`;
      setValue(nextValue);
      closeMention();
      if (uploadError) {
        setUploadError(null);
      }
      if (textarea) {
        const position = before.length + mentionText.length + (needsTrailingSpace ? 1 : 0);
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => {
            textarea.focus();
            try {
              textarea.setSelectionRange(position, position);
            } catch {
              // Ignore selection errors
            }
          });
        } else {
          textarea.focus();
          try {
            textarea.setSelectionRange(position, position);
          } catch {
            // Ignore selection errors
          }
        }
      }
      emitTyping();
    },
    [closeMention, emitTyping, mentionState.active, mentionState.start, setValue, textareaRef, uploadError, value],
  );

  const handleSelectionChange = useCallback(() => {
    const node = textareaRef.current;
    if (!node) return;
    updateMentionState(node.value, node.selectionStart ?? node.value.length);
  }, [updateMentionState]);

  const characterCount = value.length;
  const characterStatusClass =
    characterCount >= CHAT_CHARACTER_LIMIT
      ? "text-red-500"
      : characterCount > CHAT_CHARACTER_LIMIT - 40
        ? "text-brand"
        : "text-[var(--fg-muted)]";
  const hasSendableAttachments = useMemo(
    () => uploadedImages.some((image) => image.size > 0),
    [uploadedImages],
  );
  const sendDisabled =
    disabled || isSending || isUploading || (value.trim().length === 0 && !hasSendableAttachments);

  useEffect(() => {
    if (typeof draft === "string") {
      const normalizedDraft = rewriteImgBbUrlsInText(draft, { absolute: true });
      setValue((prev) => (prev === normalizedDraft ? prev : normalizedDraft));
      const urls = getMarkdownImageUrls(normalizedDraft);
      setUploadedImages((prev) => {
        const map = new Map(prev.map((image) => [image.url, image]));
        const next = urls.map((url) => map.get(url) ?? createPlaceholderImageDetails(url));
        if (next.length === prev.length && next.every((entry, index) => entry === prev[index])) {
          return prev;
        }
        return next;
      });
    } else {
      setValue("");
      setUploadedImages((prev) => (prev.length === 0 ? prev : []));
    }
  }, [draft]);

  useEffect(() => {
    const urls = getMarkdownImageUrls(value);
    setUploadedImages((prev) => {
      const map = new Map(prev.map((image) => [image.url, image]));
      const next = urls.map((url) => map.get(url) ?? createPlaceholderImageDetails(url));
      if (next.length === prev.length && next.every((entry, index) => entry === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [value]);

  const handleSubmit = useCallback(async () => {
    if (disabled || isSending || isUploading) return;
    const normalizedValue = rewriteImgBbUrlsInText(value, { absolute: true });
    if (normalizedValue !== value) {
      setValue(normalizedValue);
    }
    const trimmed = normalizedValue.trim();
    const attachments: CasualAttachmentMeta[] = uploadedImages
      .filter((image) => image.size > 0 && image.url)
      .map((image) => ({
        eventId: "",
        url: image.url,
        mimeType: image.mimeType,
        size: image.size,
        digest: image.digest,
        width: image.width,
        height: image.height,
      }));

    if (trimmed.length === 0 && attachments.length === 0) {
      return;
    }

    setIsSending(true);
    try {
      const mentionPubkeys = extractMentionedPubkeys(trimmed);
      await onSend(trimmed, attachments, { mentionPubkeys });
      setValue("");
      setError(null);
      setUploadError(null);
      closeMention();
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      setError(message);
    } finally {
      setIsSending(false);
    }
  }, [closeMention, disabled, isSending, isUploading, onSend, uploadedImages, value]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    emitTyping();
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = rewriteImgBbUrlsInText(event.target.value, { absolute: true });
    setValue(nextValue);
    const caret = event.target.selectionStart ?? nextValue.length;
    updateMentionState(nextValue, caret);
    emitTyping();
    if (uploadError) {
      setUploadError(null);
    }
  };

  const handleUploadClick = useCallback(() => {
    if (disabled || isSending || isUploading) return;
    fileInputRef.current?.click();
  }, [disabled, isSending, isUploading]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      event.target.value = "";
      if (disabled || isSending || isUploading) {
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

        setValue((prev) => {
          const normalizedPrev = rewriteImgBbUrlsInText(prev, { absolute: true });
          const prefix =
            normalizedPrev.trim().length === 0
              ? ""
              : normalizedPrev.endsWith("\n")
                ? ""
                : "\n";
          return `${normalizedPrev}${prefix}![Uploaded image](${uploaded.url})\n`;
        });
        setError(null);

        const focusTextarea = () => {
          const node = textareaRef.current;
          if (!node) return;
          const length = node.value.length;
          node.focus();
          try {
            node.setSelectionRange(length, length);
          } catch {
            // Ignore selection errors (e.g., unsupported browsers)
          }
        };

        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(focusTextarea);
        } else {
          focusTextarea();
        }

        setIsTextareaFocused(true);
      } catch (uploadErr) {
        const message = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        setUploadError(message);
      } finally {
        setIsUploading(false);
      }
    },
    [disabled, isSending, isUploading],
  );

  const handleRemoveImage = useCallback(
    (url: string) => {
      setUploadedImages((prev) => prev.filter((item) => item.url !== url));
      setValue((prev) => {
        const lines = prev.split("\n");
        const filteredLines = lines.filter((line) => {
          const trimmed = line.trim();
          if (!trimmed.includes(url)) {
            return true;
          }
          const match = trimmed.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
          return match?.[1] !== url;
        });
        let next = filteredLines.join("\n");
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
    [setUploadedImages],
  );

  const composerExpanded =
    isTextareaFocused || value.trim().length > 0 || uploadedImages.length > 0;

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
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelectionChange}
          onKeyUp={handleSelectionChange}
          onClick={handleSelectionChange}
          disabled={disabled || isSending}
          onFocus={() => setIsTextareaFocused(true)}
          onBlur={() => {
            if (value.trim().length === 0) {
              setIsTextareaFocused(false);
            }
            closeMention();
          }}
          rows={composerExpanded ? 4 : 1}
          maxLength={CHAT_CHARACTER_LIMIT}
          placeholder={disabled ? "Your BitcoinSquare keys must be ready before posting" : "Share an update…"}
          className={`w-full resize-none rounded-2xl border-none bg-transparent px-4 pr-16 text-sm leading-relaxed text-[var(--fg-default)] focus:outline-none focus:ring-0 ${
            composerExpanded ? "pb-16" : "pb-12"
          }`}
        />
        {mentionDropdownVisible && (
          <div className="pointer-events-auto absolute left-4 right-4 bottom-24 z-20 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 shadow-xl">
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
                      <img
                        src={target.avatarUrl}
                        alt=""
                        className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                      />
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
        {uploadedImages.length > 0 && (
          <div className="px-4">
            <div className="flex flex-wrap gap-3 pb-4 pt-2">
              {uploadedImages.map((image) => (
                <div
                  key={image.digest ?? image.url}
                  className="group relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-sm"
                >
                  <img
                    src={image.url}
                    alt="Uploaded image preview"
                    className="h-24 w-24 object-cover sm:h-28 sm:w-28"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(image.url)}
                    className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                    aria-label="Remove image"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end px-4 pb-3">
          <div className="pointer-events-auto flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={disabled || isSending || isUploading}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--fg-muted)] shadow-sm transition hover:-translate-y-0.5 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
              <span className="sr-only">Upload image</span>
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={sendDisabled}
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
        {isUploading && (
          <span className="inline-flex items-center gap-2 text-[var(--fg-muted)]">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            <span>Optimizing & uploading image…</span>
          </span>
        )}
      </div>
      {(error || uploadError) && (
        <div className="space-y-1">
          {error && <p className="text-xs text-red-500">{error}</p>}
          {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
        </div>
      )}
    </div>
  );
};

const NotificationsPanel: React.FC<{
  open: boolean;
  items: NotificationItem[];
  onClose: () => void;
  onAction: (item: NotificationItem) => void;
}> = ({ open, items, onClose, onAction }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const node = panelRef.current;
    if (node) {
      node.focus({ preventScroll: true });
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="community-notifications-heading"
    >
      <div
        ref={panelRef}
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl focus:outline-none"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-5 py-4">
          <h2
            id="community-notifications-heading"
            className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]"
          >
            Notifications
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            aria-label="Close notifications"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">
              No notifications yet. We&apos;ll let you know when someone replies or mentions you.
            </p>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--fg-default)]">{item.summary}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-[var(--fg-muted)]">{item.groupLabel}</p>
                    </div>
                    <span className="text-xs text-[var(--fg-muted)]">{formatTimestamp(item.timestamp)}</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {item.previews.map((preview) => (
                      <div key={preview.id} className="flex items-start gap-3">
                        <img
                          src={preview.avatarUrl}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                        <div className="min-w-0 text-sm text-[var(--fg-default)]">
                          <p className="font-semibold">{preview.authorName}</p>
                          <p className="text-[13px] text-[var(--fg-muted)]">{preview.snippet}</p>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-[var(--fg-muted)]">
                            {formatTimestamp(preview.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                    {item.overflowCount > 0 && (
                      <p className="text-xs text-[var(--fg-muted)]">
                        +{item.overflowCount.toLocaleString()} more replies in this thread
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onAction(item)}
                    className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                  >
                    View thread
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CommunityView: React.FC = () => {
  const { theme } = useTheme();
  const {
    roomId,
    messages: rawMessages,
    sendMessage,
    likeMessage,
    deleteMessage,
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
    deletePost: deleteFeedPost,
    loadMore: loadMoreFeed,
    loadingMore: feedLoadingMore,
    hasMore: feedHasMore,
    error: feedError,
    pubkey: feedPubkey,
    initialLoading: feedInitialLoading,
  } = useBitcoinSquareFeed();
  const { user, refreshNostrKeys } = useAuth();
  const { conversations } = useDirectMessages();
  const canModerate = user?.isAdmin === true;

  const navigate = useNavigate();
  const location = useLocation();
  const { postId: routePostIdParam } = useParams<{ postId?: string }>();
  const routePostId = routePostIdParam ?? null;
  const cameFromCommunity = Boolean(
    (location.state as { fromCommunity?: boolean } | null)?.fromCommunity,
  );

  const handleThreadRouteChange = useCallback(
    (nextId: string | null) => {
      if (nextId) {
        if (routePostId === nextId) {
          return;
        }
        navigate(`/community/forum/${nextId}`, {
          state: { fromCommunity: true },
        });
        return;
      }

      if (!routePostId) {
        return;
      }

      if (cameFromCommunity) {
        navigate(-1);
      } else {
        navigate("/community", { replace: true });
      }
    },
    [cameFromCommunity, navigate, routePostId],
  );

  const directMessagesPath = user?.nostrPublicKey?.trim()
    ? `/profile/${user.nostrPublicKey.trim()}/messages`
    : "/messages";
  const {
    ready: accountReady,
    loading: accountLoading,
    signEvent: globalSignEvent,
    pubkey: accountPubkey,
    error: accountError,
  } = useNostrAccount();

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

  const [activeView, setActiveView] = useState<ActiveView>("casual");

  useEffect(() => {
    if (routePostId) {
      setActiveView("feed");
    }
  }, [routePostId]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const composerContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollUpdateFrameRef = useRef<number | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState<string | undefined>(undefined);
  const [quoteContext, setQuoteContext] = useState<QuoteContextState | null>(null);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(null);
  const [rawDataMessage, setRawDataMessage] = useState<CasualChatMessage | null>(null);
  const [isAtTop, setIsAtTop] = useState(true);
  const [newMessageAnchor, setNewMessageAnchor] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => new Set());
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
  const { requestProfile, resolveProfileSummary, openProfile, follow, following, profiles } =
    useProfileIdentity();
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

  useEffect(() => {
    if (!openMessageMenuId) return;
    if (typeof document === "undefined") return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setOpenMessageMenuId(null);
        return;
      }
      const container = target.closest<HTMLElement>("[data-message-menu-root]");
      if (!container || container.dataset.messageMenuRoot !== openMessageMenuId) {
        setOpenMessageMenuId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMessageMenuId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMessageMenuId]);

  useEffect(() => {
    if (!rawDataMessage) return;
    if (typeof document === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRawDataMessage(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [rawDataMessage]);

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
    if (!translationEnabled) return;
    messages.forEach((message) => {
      ensureTranslation(`chat:${message.id}`, message.markdown);
    });
  }, [ensureTranslation, messages, translationEnabled]);

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

  const mentionTargets = useMemo<MentionTarget[]>(() => {
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

    contextMembers.forEach((member) => addTarget(member.pubkey));
    Object.values(conversations).forEach((conversation) => addTarget(conversation.peerPubkey));
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
  }, [conversations, contextMembers, following, profiles, pubkey, resolveProfileSummary]);
  const requestedMentionProfilesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mentionTargets.forEach((target) => {
      if (requestedMentionProfilesRef.current.has(target.pubkey)) {
        return;
      }
      requestedMentionProfilesRef.current.add(target.pubkey);
      void requestProfile(target.pubkey);
    });
  }, [mentionTargets, requestProfile]);

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
  const feedPostsById = useMemo(() => {
    const map = new Map<string, FeedPost>();
    feedPosts.forEach((post) => {
      map.set(post.id, post);
    });
    return map;
  }, [feedPosts]);
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
  const viewerPubkey = useMemo(() => {
    const candidates = [pubkey, feedPubkey, accountPubkey, user?.nostrPublicKey];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length === 64) {
        return candidate.trim().toLowerCase();
      }
    }
    return null;
  }, [accountPubkey, feedPubkey, pubkey, user?.nostrPublicKey]);
  const notificationItems = useMemo<NotificationItem[]>(() => {
    if (!viewerPubkey) {
      return [];
    }
    const lowerViewer = viewerPubkey;
    const items: NotificationItem[] = [];
    const chatReplyGroups = new Map<
      string,
      {
        originalId: string;
        previews: NotificationPreview[];
        authors: string[];
        latest: number;
        total: number;
      }
    >();
    const handledChatMessages = new Set<string>();

    messages.forEach((message) => {
      if (message.status !== "ok" || message.optimistic) {
        return;
      }
      const author = typeof message.pubkey === "string" ? message.pubkey.toLowerCase() : "";
      if (!author || author === lowerViewer) {
        return;
      }
      if (message.quotePubkey?.toLowerCase() === lowerViewer && message.quoteId) {
        const summary = resolveProfileSummary(message.pubkey);
        const snippet = buildQuoteSnippet(message.body ?? message.markdown ?? "");
        const key = `chat-reply:${message.quoteId}`;
        const existing = chatReplyGroups.get(key) ?? {
          originalId: message.quoteId,
          previews: [],
          authors: [],
          latest: 0,
          total: 0,
        };
        existing.previews.push({
          id: message.id,
          authorName: summary.displayName,
          avatarUrl: summary.avatarUrl,
          snippet,
          timestamp: message.created_at,
        });
        existing.authors.push(summary.displayName);
        existing.latest = Math.max(existing.latest, message.created_at);
        existing.total += 1;
        chatReplyGroups.set(key, existing);
        handledChatMessages.add(message.id);
      }
    });

    chatReplyGroups.forEach((group, key) => {
      const sorted = [...group.previews].sort((a, b) => b.timestamp - a.timestamp);
      const previews = sorted.slice(0, NOTIFICATION_PREVIEW_LIMIT);
      const summary = `${formatNameList(group.authors)} replied to your message in Chat`;
      const targetMessageId = previews[0]?.id ?? group.originalId;
      items.push({
        id: key,
        summary,
        groupLabel: "Chat",
        timestamp: group.latest,
        previews,
        overflowCount: Math.max(0, group.total - previews.length),
        action: { kind: "chat", messageId: targetMessageId, originalId: group.originalId },
        kind: "chat-reply",
      });
    });

    const feedReplyGroups = new Map<
      string,
      {
        postId: string;
        previews: NotificationPreview[];
        authors: string[];
        latest: number;
        total: number;
      }
    >();
    const handledFeedReplies = new Set<string>();

    feedPosts.forEach((post) => {
      if (post.status !== "ok" || post.optimistic) {
        return;
      }
      const author = typeof post.pubkey === "string" ? post.pubkey.toLowerCase() : "";
      if (!author || author === lowerViewer) {
        return;
      }
      const targetId = extractFeedReplyTargetId(post.tags);
      if (!targetId) {
        return;
      }
      const targetPost = feedPostsById.get(targetId);
      if (!targetPost || targetPost.pubkey?.toLowerCase() !== lowerViewer) {
        return;
      }
      const summary = resolveProfileSummary(post.pubkey);
      const snippet = buildQuoteSnippet(post.content ?? "");
      const key = `feed-reply:${targetId}`;
      const existing = feedReplyGroups.get(key) ?? {
        postId: targetId,
        previews: [],
        authors: [],
        latest: 0,
        total: 0,
      };
      existing.previews.push({
        id: post.id,
        authorName: summary.displayName,
        avatarUrl: summary.avatarUrl,
        snippet,
        timestamp: post.created_at,
      });
      existing.authors.push(summary.displayName);
      existing.latest = Math.max(existing.latest, post.created_at);
      existing.total += 1;
      feedReplyGroups.set(key, existing);
      handledFeedReplies.add(post.id);
    });

    feedReplyGroups.forEach((group, key) => {
      const sorted = [...group.previews].sort((a, b) => b.timestamp - a.timestamp);
      const previews = sorted.slice(0, NOTIFICATION_PREVIEW_LIMIT);
      const summary = `${formatNameList(group.authors)} replied to your post in Forum`;
      const focusId = previews[0]?.id ?? group.postId;
      items.push({
        id: key,
        summary,
        groupLabel: "Forum",
        timestamp: group.latest,
        previews,
        overflowCount: Math.max(0, group.total - previews.length),
        action: { kind: "feed", postId: group.postId, replyId: focusId },
        kind: "feed-reply",
      });
    });

    messages.forEach((message) => {
      if (message.status !== "ok" || message.optimistic) {
        return;
      }
      if (handledChatMessages.has(message.id)) {
        return;
      }
      const author = typeof message.pubkey === "string" ? message.pubkey.toLowerCase() : "";
      if (!author || author === lowerViewer) {
        return;
      }
      const tagMention = message.tags?.some(
        (tag) => Array.isArray(tag) && tag[0] === "p" && typeof tag[1] === "string" && tag[1].trim().toLowerCase() === lowerViewer,
      );
      const textMention = includesMentionOfPubkey(message.body ?? message.markdown ?? "", lowerViewer);
      if (!tagMention && !textMention) {
        return;
      }
      const summary = resolveProfileSummary(message.pubkey);
      const snippet = buildQuoteSnippet(message.body ?? message.markdown ?? "");
      items.push({
        id: `chat-mention:${message.id}`,
        summary: `${summary.displayName} mentioned you in Chat`,
        groupLabel: "Chat",
        timestamp: message.created_at,
        previews: [
          {
            id: message.id,
            authorName: summary.displayName,
            avatarUrl: summary.avatarUrl,
            snippet,
            timestamp: message.created_at,
          },
        ],
        overflowCount: 0,
        action: { kind: "chat", messageId: message.id, originalId: message.quoteId },
        kind: "chat-mention",
      });
    });

    feedPosts.forEach((post) => {
      if (post.status !== "ok" || post.optimistic) {
        return;
      }
      if (handledFeedReplies.has(post.id)) {
        return;
      }
      const author = typeof post.pubkey === "string" ? post.pubkey.toLowerCase() : "";
      if (!author || author === lowerViewer) {
        return;
      }
      const tagMention = post.tags?.some(
        (tag) => Array.isArray(tag) && tag[0] === "p" && typeof tag[1] === "string" && tag[1].trim().toLowerCase() === lowerViewer,
      );
      const textMention = includesMentionOfPubkey(post.content ?? "", lowerViewer);
      if (!tagMention && !textMention) {
        return;
      }
      const summary = resolveProfileSummary(post.pubkey);
      const snippet = buildQuoteSnippet(post.content ?? "");
      items.push({
        id: `feed-mention:${post.id}`,
        summary: `${summary.displayName} mentioned you in Forum`,
        groupLabel: "Forum",
        timestamp: post.created_at,
        previews: [
          {
            id: post.id,
            authorName: summary.displayName,
            avatarUrl: summary.avatarUrl,
            snippet,
            timestamp: post.created_at,
          },
        ],
        overflowCount: 0,
        action: { kind: "feed", postId: post.id, replyId: post.id },
        kind: "feed-mention",
      });
    });

    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [feedPosts, feedPostsById, messages, resolveProfileSummary, viewerPubkey]);
  const hasUnreadDirectMessages = useMemo(
    () => Object.values(conversations).some((conversation) => conversation.unreadCount > 0),
    [conversations],
  );
  const hasUnreadNotifications = useMemo(
    () => notificationItems.some((item) => !readNotificationIds.has(item.id)),
    [notificationItems, readNotificationIds],
  );

  useEffect(() => {
    if (!notificationsOpen) {
      return;
    }
    setReadNotificationIds((prev) => {
      const next = new Set(prev);
      notificationItems.forEach((item) => {
        next.add(item.id);
      });
      return next;
    });
  }, [notificationItems, notificationsOpen]);

  const membersHeading = isCasualView
    ? "Chat members"
    : isPublicFeedView
      ? "Forum members"
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
          if (routePostId && tab.key !== "feed") {
            handleThreadRouteChange(null);
          }
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
  const showJumpToLatest = isCasualView && !isAtTop && messages.length > 0;

  const handleSend = useCallback(
    async (
      text: string,
      attachments: CasualAttachmentMeta[],
      options?: { quoteId?: string | null; quotePubkey?: string | null; mentionPubkeys?: string[] },
    ) => {
      await sendMessage(text, attachments, options);
      setComposerError(null);
    },
    [sendMessage],
  );

  const handleComposerSend = useCallback(
    async (
      text: string,
      attachments: CasualAttachmentMeta[],
      metadata?: { mentionPubkeys?: string[] },
    ) => {
      try {
        const quoteId = quoteContext?.id ?? null;
        const quotePubkey = quoteContext?.pubkey ?? null;
        await handleSend(text, attachments, {
          quoteId,
          quotePubkey,
          mentionPubkeys: metadata?.mentionPubkeys,
        });
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

  const handleNotificationAction = useCallback(
    (item: NotificationItem) => {
      setNotificationsOpen(false);
      setReadNotificationIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      if (item.action.kind === "chat") {
        const targetId = item.action.messageId;
        setActiveView("casual");
        if (targetId) {
          setTimeout(() => {
            handleScrollToMessage(targetId);
          }, 0);
        }
        return;
      }
      if (item.action.kind === "feed") {
        setActiveView("feed");
        handleThreadRouteChange(item.action.postId);
      }
    },
    [handleScrollToMessage, handleThreadRouteChange, setActiveView],
  );

  const updatePendingDelete = useCallback((messageId: string, add: boolean) => {
    setPendingDeletes((prev) => {
      const next = new Set(prev);
      if (add) {
        next.add(messageId);
      } else {
        next.delete(messageId);
      }
      return next;
    });
  }, []);

  const handleLikeMessage = useCallback(
    async (message: CasualChatMessage) => {
      if (pubkey && message.likePubkeys.includes(pubkey)) {
        return;
      }
      try {
        await likeMessage(message);
      } catch (reactionError) {
        const messageText = reactionError instanceof Error ? reactionError.message : String(reactionError);
        setComposerError(messageText);
      }
    },
    [likeMessage, pubkey],
  );

  const handleDeleteMessage = useCallback(
    async (message: CasualChatMessage) => {
      if (!canModerate) {
        setComposerError("Only admins can delete messages.");
        return;
      }
      setOpenMessageMenuId(null);
      if (typeof window !== "undefined") {
        const confirmed = window.confirm("Delete this message from chat?");
        if (!confirmed) {
          return;
        }
      }

      updatePendingDelete(message.id, true);
      try {
        await deleteMessage(message);
      } catch (deleteError) {
        const messageText = deleteError instanceof Error ? deleteError.message : String(deleteError);
        setComposerError(messageText);
      } finally {
        updatePendingDelete(message.id, false);
      }
    },
    [canModerate, deleteMessage, setOpenMessageMenuId, updatePendingDelete, setComposerError],
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
        <aside className="hidden border-r border-[var(--border-subtle)] bg-[var(--bg-card)]/70 px-5 pb-8 pt-24 backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-80 lg:flex-col">
          <nav
            aria-label="Community navigation"
            role="tablist"
            className="flex flex-col gap-2"
          >
            {DESKTOP_VIEW_TABS.map((tab) => renderTabButton(tab, "desktop"))}
          </nav>
          <NavLink
            to={directMessagesPath}
            className={({ isActive }) =>
              `mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
                isActive
                  ? "border-brand bg-brand/10 text-brand shadow-sm"
                  : "border-transparent text-[var(--fg-muted)] hover:border-brand hover:text-brand"
              }`
            }
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            <span className="relative inline-flex items-center gap-1">
              Messages
              {hasUnreadDirectMessages && (
                <>
                  <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
                  <span className="sr-only">New messages</span>
                </>
              )}
            </span>
          </NavLink>
          <button
            type="button"
            onClick={() => setNotificationsOpen(true)}
            className={`mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
              notificationsOpen
                ? "border-brand bg-brand/10 text-brand shadow-sm"
                : "border-transparent text-[var(--fg-muted)] hover:border-brand hover:text-brand"
            }`}
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span className="relative inline-flex items-center gap-1">
              Notifications
              {hasUnreadNotifications && (
                <>
                  <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
                  <span className="sr-only">New notifications</span>
                </>
              )}
            </span>
          </button>
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
              className="-mx-5 ml-[60px] flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pl-20 pb-2 text-sm scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:ml-0 sm:pl-5"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {MOBILE_VIEW_TABS.map((tab) => renderTabButton(tab, "mobile"))}
            </nav>
          </div>
          <main className="relative flex flex-1 min-h-0 flex-col">
            {isCasualView ? (
              <section
                id="community-panel-casual"
                role="tabpanel"
                aria-labelledby="community-tab-casual"
                className="relative flex flex-1 min-h-0 flex-col"
              >
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
                          const translationKey = `chat:${message.id}`;
                          const translationEntry = translationEnabled
                            ? getTranslation(translationKey)
                            : undefined;
                          const translationStatus = translationEntry?.status ?? "idle";
                          const rawTranslatedText =
                            translationEntry?.translatedText &&
                            translationEntry.translatedText.trim().length > 0
                              ? translationEntry.translatedText
                              : null;
                          const translationReady =
                            translationEnabled && translationStatus === "ready" && !!rawTranslatedText;
                          const showOriginal =
                            !translationEnabled || !translationReady || isOriginalVisible(translationKey);
                          const translatedHtml =
                            translationEnabled && translationReady && rawTranslatedText
                              ? markdownToHtml(rawTranslatedText)
                              : null;
                          const renderedHtml =
                            translatedHtml && translationEnabled && !showOriginal
                              ? translatedHtml
                              : message.html;
                          const detectedLanguageLabel =
                            translationEnabled &&
                            translationEntry?.detectedLanguage &&
                            translationEntry.detectedLanguage.trim().length > 0
                              ? formatLanguageName(translationEntry.detectedLanguage)
                              : null;
                          const translationNoticeColor = isSelf
                            ? "text-white/70"
                            : "text-[var(--fg-muted)]";
                          const likeCount = message.likePubkeys.length;
                          const likedByCurrentUser = pubkey ? message.likePubkeys.includes(pubkey) : false;
                          const likeDisabled = !ready || likedByCurrentUser;
                          const likeButtonPalette = likedByCurrentUser
                            ? isSelf
                              ? "border-rose-200 text-rose-100 bg-rose-500/30"
                              : "border-rose-300 text-rose-500 bg-rose-500/20"
                            : isSelf
                              ? "border-white/60 text-white hover:border-white"
                              : "border-white/70 text-[var(--fg-muted)] hover:border-brand hover:text-brand";
                          const likeBadgePalette = likedByCurrentUser
                            ? isSelf
                              ? "bg-rose-500/40 text-white"
                              : "bg-rose-500/15 text-rose-500"
                            : isSelf
                              ? "bg-white/20 text-white"
                              : "bg-brand/10 text-brand";
                          const isPendingDelete = pendingDeletes.has(message.id);
                          const deleteDisabled = !ready || isPendingDelete;
                          const isMessageMenuOpen = openMessageMenuId === message.id;
                          const messageMenuButtonPalette = isSelf
                            ? "border-white/60 text-white hover:border-white"
                            : "border-white/70 text-[var(--fg-muted)] hover:border-brand hover:text-brand";
                          const deleteOptionClasses = deleteDisabled
                            ? isSelf
                              ? "cursor-not-allowed text-white/50"
                              : "cursor-not-allowed text-[var(--fg-muted)]/60"
                            : isSelf
                              ? "text-red-200 hover:bg-red-500/20"
                              : "text-red-400 hover:bg-red-500/15";
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
                              {newMessageAnchor === message.id && (
                                <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-brand">
                                  <span className="h-px flex-1 bg-brand/40" />
                                  <span>New messages</span>
                                  <span className="h-px flex-1 bg-brand/40" />
                                </div>
                              )}
                              <div className={`flex w-full ${isSelf ? "justify-end" : "justify-start"} py-2`}>
                                <div className={`flex w-full items-end gap-3 ${isSelf ? "flex-row-reverse" : ""}`}>
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

                                    {translationEnabled && (
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
                                      <div className="relative" data-message-menu-root={message.id}>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setOpenMessageMenuId((current) =>
                                              current === message.id ? null : message.id,
                                            );
                                          }}
                                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${messageMenuButtonPalette} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60`}
                                          aria-expanded={isMessageMenuOpen}
                                          aria-haspopup="menu"
                                          aria-label="Message options"
                                          title="Message options"
                                        >
                                          ...
                                        </button>
                                        {isMessageMenuOpen && (
                                          <div
                                            role="menu"
                                            className="absolute right-0 z-30 mt-2 w-48 rounded-2xl border border-white/40 bg-[var(--bg-card)]/95 p-1 text-xs shadow-xl backdrop-blur"
                                          >
                                            <button
                                              type="button"
                                              role="menuitem"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setOpenMessageMenuId(null);
                                                setRawDataMessage(message);
                                              }}
                                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium transition hover:bg-[var(--bg-muted)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                                            >
                                              <span className="inline-block h-2 w-2 rounded-full bg-brand" aria-hidden />
                                              <span>View raw data</span>
                                            </button>
                                            {canModerate && (
                                              <button
                                                type="button"
                                                role="menuitem"
                                                disabled={deleteDisabled}
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  if (deleteDisabled) {
                                                    return;
                                                  }
                                                  setOpenMessageMenuId(null);
                                                  void handleDeleteMessage(message);
                                                }}
                                                className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-60 ${deleteOptionClasses}`}
                                              >
                                                {isPendingDelete ? (
                                                  <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                  <Trash2 className="h-4 w-4" />
                                                )}
                                                <span>Delete message</span>
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleLikeMessage(message)}
                                        disabled={likeDisabled}
                                        aria-pressed={likedByCurrentUser}
                                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${likeButtonPalette} disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60`}
                                        title={likedByCurrentUser ? "You liked this message" : "Send a like"}
                                      >
                                        <Heart className="h-4 w-4" fill={likedByCurrentUser ? "currentColor" : "none"} />
                                        <span className="sr-only">Like</span>
                                      </button>
                                    </div>

                                    {likeCount > 0 && (
                                      <div className={`mt-2 flex ${isSelf ? "justify-end" : ""}`}>
                                        <span
                                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.3em] ${likeBadgePalette}`}
                                        >
                                          <Heart className="h-3 w-3" fill="currentColor" />
                                          <span>{likeCount === 1 ? "1 Like" : `${likeCount} Likes`}</span>
                                        </span>
                                      </div>
                                    )}

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
                            {`${typingSummaries.map((entry) => entry.displayName).join(", ")} typing…`}
                          </div>
                      </div>
                    )}
                    {roomKeyError && <p className="text-sm text-red-500">{roomKeyError}</p>}
                    {sendError && <p className="text-sm text-red-500">{sendError}</p>}
                    {composerError && <p className="text-sm text-red-500">{composerError}</p>}
                    <Composer
                      disabled={!ready}
                      onSend={handleComposerSend}
                      draft={composerDraft}
                      onTyping={sendTyping}
                      quoteContext={quoteContext}
                      onClearQuote={() => setQuoteContext(null)}
                      onJumpToQuote={handleScrollToMessage}
                      mentionTargets={mentionTargets}
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
                        deletePost={deleteFeedPost}
                        loadMore={loadMoreFeed}
                        loadingMore={feedLoadingMore}
                        hasMore={feedHasMore}
                        error={feedError}
                        pubkey={feedPubkey}
                        initialLoading={feedInitialLoading}
                        initialThreadId={routePostId}
                        onThreadChange={handleThreadRouteChange}
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
                        deletePost={deleteFeedPost}
                        loadMore={loadMoreFeed}
                        loadingMore={feedLoadingMore}
                        hasMore={feedHasMore}
                        error={feedError}
                        pubkey={feedPubkey}
                        initialLoading={feedInitialLoading}
                        initialThreadId={routePostId}
                        onThreadChange={handleThreadRouteChange}
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
                              Browse the Forum to discover people to follow.
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

      <NotificationsPanel
        open={notificationsOpen}
        items={notificationItems}
        onClose={() => setNotificationsOpen(false)}
        onAction={handleNotificationAction}
      />
      {rawDataMessage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
          onClick={() => setRawDataMessage(null)}
        >
          <div
            className="relative max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setRawDataMessage(null)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Close raw data"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <h2 className="pr-10 text-sm font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]">
              Message raw data
            </h2>
            <pre className="mt-4 max-h-[70vh] overflow-auto rounded-2xl bg-[var(--bg-muted)]/40 p-4 text-left text-xs text-[var(--fg-default)]">
              {JSON.stringify(rawDataMessage, null, 2)}
            </pre>
          </div>
        </div>
      )}

    </div>
  );
};

const Community: React.FC = () => (
  <CommunityTranslationProvider>
    <CommunityView />
  </CommunityTranslationProvider>
);

export default Community;
