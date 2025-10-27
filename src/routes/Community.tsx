import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { decryptBinary } from "../utils/aes";
import { getCachedMediaBlob, getCachedPreview, setCachedMediaBlob, setCachedPreview } from "../utils/mediaCache";
import { fetchUsersByScreenNames, searchUsersByScreenName, type ScreenNameUser } from "../api/users";
import { fallbackProfileAvatar, useProfileIdentity } from "../context/ProfileIdentityContext";
import type { ProfileSummary } from "../context/ProfileIdentityContext";
import { useAuth } from "../context/AuthContext";
import { useDirectMessages } from "../context/DirectMessageContext";
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
  stripImagePlaceholders,
} from "../utils/markdown";
import {
  createPlaceholderImageDetails,
  uploadImageViaWorker,
  validateImageFile,
  type UploadedImageDetails,
} from "../utils/imageUpload";
import { rewriteImgBbUrlToProxy, rewriteImgBbUrlsInText } from "../utils/imageProxy";
import { resolveMentionTargets, type MentionCandidate } from "../utils/mentions";
import useMentionAutocomplete from "../hooks/useMentionAutocomplete";

type ActiveView = "casual" | "feed" | "personal" | "notifications" | "members";

type ViewTab = { key: ActiveView; label: string; icon: LucideIcon };

const PRIMARY_VIEW_TABS: ViewTab[] = [
  { key: "casual", label: "Chat", icon: MessageCircle },
  { key: "feed", label: "Forum", icon: Newspaper },
  { key: "personal", label: "Your Feed", icon: Sparkles },
];

const NOTIFICATIONS_TAB: ViewTab = { key: "notifications", label: "Notifications", icon: Bell };

const DESKTOP_VIEW_TABS: ViewTab[] = PRIMARY_VIEW_TABS;

const MOBILE_VIEW_TABS: ViewTab[] = [
  ...PRIMARY_VIEW_TABS,
  NOTIFICATIONS_TAB,
  { key: "members", label: "Members", icon: Users },
];

type CommunityNotification = {
  id: string;
  user: string;
  threadLabel?: string;
  message?: string;
  targetView?: ActiveView;
  targetMessageId?: string;
  targetPostId?: string;
};

type CommunityNotificationGroup = {
  id: string;
  title: string;
  context?: string;
  notifications: CommunityNotification[];
};

const CASUAL_MENTION_GROUP_ID = "casual-mentions";

type NotificationTarget = {
  view: ActiveView;
  messageId?: string | null;
  postId?: string | null;
};

const INITIAL_NOTIFICATION_GROUPS: CommunityNotificationGroup[] = [
  {
    id: CASUAL_MENTION_GROUP_ID,
    title: `${CASUAL_ROOM_NAME} mentions`,
    context: "Mentions from the community chat",
    notifications: [],
  },
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

  const lightboxContent =
    lightboxOpen && fullUrl
      ? (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex h-screen w-screen items-center justify-center bg-black/90 p-0 sm:p-6"
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
            <div className="flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
              <img
                src={fullUrl}
                alt="Attachment"
                className="mx-auto block h-auto max-h-full w-auto max-w-full object-contain"
                loading="lazy"
              />
            </div>
          </div>
        )
      : null;

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
      {lightboxContent &&
        (typeof document !== "undefined"
          ? createPortal(lightboxContent, document.body)
          : lightboxContent)}
    </div>
  );
};

const Composer: React.FC<{
  disabled: boolean;
  onSend: (text: string, attachments: CasualAttachmentMeta[]) => Promise<void>;
  draft?: string;
  onTyping?: () => void;
  quoteContext?: QuoteContextState | null;
  onClearQuote?: () => void;
  onJumpToQuote?: (messageId: string) => void;
  fetchMentionCandidates: (query: string, limit: number) => Promise<MentionCandidate[]>;
  mentionCandidates: MentionCandidate[];
}> = ({
  disabled,
  onSend,
  draft,
  onTyping,
  quoteContext,
  onClearQuote,
  onJumpToQuote,
  fetchMentionCandidates,
  mentionCandidates,
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
  const typingEmitRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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

  const emitTyping = useCallback(() => {
    if (!onTyping) return;
    const now = Date.now();
    if (now - typingEmitRef.current < 400) return;
    typingEmitRef.current = now;
    onTyping();
  }, [onTyping]);

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
    value,
    onChange: setValue,
    textareaRef,
    fetchCandidates: fetchMentionCandidates,
    candidates: mentionCandidates,
    limit: 5,
    listIdPrefix: "casual-composer-mentions",
    onMentionInserted: () => {
      setIsTextareaFocused(true);
      emitTyping();
    },
  });

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
      await onSend(trimmed, attachments);
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
    if (handleMentionKeyDown(event)) {
      return;
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
    emitTyping();
    if (uploadError) {
      setUploadError(null);
    }
    updateMentionState(nextValue, event.target.selectionStart ?? nextValue.length);
  };

  const handleSelectionChange = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const node = event.currentTarget;
    updateMentionState(node.value, node.selectionStart ?? node.value.length);
  };

  const handleFocus = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    setIsTextareaFocused(true);
    updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length);
  };

  const handleBlur = () => {
    if (value.trim().length === 0) {
      setIsTextareaFocused(false);
    }
    closeMention();
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
        closeMention();
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
    [closeMention, disabled, isSending, isUploading],
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

  const mentionDropdownBottom = uploadedImages.length > 0 ? "12rem" : composerExpanded ? "7rem" : "5.5rem";

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
          onClick={handleSelectionChange}
          disabled={disabled || isSending}
          onFocus={handleFocus}
          onBlur={handleBlur}
          rows={composerExpanded ? 4 : 1}
          maxLength={CHAT_CHARACTER_LIMIT}
          placeholder={disabled ? "Your BitcoinSquare keys must be ready before posting" : "Share an update…"}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={mentionActive ? mentionListId : undefined}
          aria-expanded={mentionActive}
          aria-activedescendant={activeMentionOptionId}
          className={`w-full resize-none rounded-2xl border-none bg-transparent px-4 pr-16 text-sm leading-relaxed text-[var(--fg-default)] focus:outline-none focus:ring-0 ${
            composerExpanded ? "pb-16" : "pb-12"
          }`}
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
                        onMouseEnter={() => setMentionHighlightIndex(index)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition ${
                          isActive ? "bg-brand/10 text-brand" : "text-[var(--fg-default)] hover:bg-[var(--bg-surface)]/80"
                        }`}
                      >
                        <img
                          src={candidate.avatarUrl}
                          alt={candidate.displayName}
                          className="h-8 w-8 rounded-full border border-[var(--border-subtle)] object-cover"
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold">{candidate.displayName}</span>
                          <span className="truncate text-xs text-[var(--fg-muted)]">
                            @{candidate.screenName || candidate.shortPubkey}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
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

  const { conversations } = useDirectMessages();
  const [activeView, setActiveView] = useState<ActiveView>("casual");
  const [notificationGroups, setNotificationGroups] = useState<CommunityNotificationGroup[]>(
    INITIAL_NOTIFICATION_GROUPS,
  );
  const [unreadNotificationIds, setUnreadNotificationIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [pendingNotificationTarget, setPendingNotificationTarget] =
    useState<NotificationTarget | null>(null);
  const hasUnreadNotifications = unreadNotificationIds.size > 0;

  useEffect(() => {
    if (routePostId) {
      setActiveView("feed");
    }
  }, [routePostId]);
  const isMessagesRouteActive = location.pathname.startsWith(directMessagesPath);

  const hasUnreadMessages = useMemo(
    () => Object.values(conversations).some((conversation) => conversation.unreadCount > 0),
    [conversations],
  );
  const isCasualView = activeView === "casual";
  const isPublicFeedView = activeView === "feed";
  const isPersonalFeedView = activeView === "personal";
  const isNotificationsView = activeView === "notifications";
  const isAnyFeedView = isPublicFeedView || isPersonalFeedView;
  const isMembersView = activeView === "members";

  useEffect(() => {
    if (!isNotificationsView) {
      return;
    }
    setUnreadNotificationIds((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      return new Set<string>();
    });
  }, [isNotificationsView]);
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
  const {
    profiles,
    requestProfile,
    resolveProfileSummary,
    openProfile,
    follow,
    following,
    shortenPubkey,
  } = useProfileIdentity();
  const backgroundTexture = useMemo(
    () => (theme === "dark" ? DARK_BACKGROUND_TEXTURE : LIGHT_BACKGROUND_TEXTURE),
    [theme],
  );
  const personalFeedPosts = useMemo(
    () => feedPosts.filter((post) => following.has(post.pubkey)),
    [feedPosts, following],
  );
  const hasFollowing = following.size > 0;

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
    [fallbackProfileAvatar, resolveProfileSummary, shortenPubkey],
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

  const fetchMentionTargets = useCallback(
    async (handles: string[]) => {
      const users = await fetchUsersByScreenNames(handles);
      users.forEach((user) => {
        if (user.nostrPubkey) {
          requestProfile(user.nostrPubkey).catch(() => undefined);
        }
      });
      return users
        .map((user) => mapUserToMentionCandidate(user))
        .filter((candidate): candidate is MentionCandidate => Boolean(candidate));
    },
    [mapUserToMentionCandidate, requestProfile],
  );

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
        <span className="flex items-center gap-2">
          <span>{tab.label}</span>
          {tab.key === "notifications" && hasUnreadNotifications && (
            <span aria-hidden="true" className="text-brand text-xs leading-none">
              ●
            </span>
          )}
        </span>
        {tab.key === "notifications" && hasUnreadNotifications && (
          <span className="sr-only">Unread notifications available</span>
        )}
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
      options?: { quoteId?: string | null; quotePubkey?: string | null },
    ) => {
      const messageId = await sendMessage(text, attachments, options);
      setComposerError(null);
      return messageId;
    },
    [sendMessage],
  );

  const handleComposerSend = useCallback(
    async (text: string, attachments: CasualAttachmentMeta[]) => {
      try {
        const quoteId = quoteContext?.id ?? null;
        const quotePubkey = quoteContext?.pubkey ?? null;
        const sentMessageId = await handleSend(text, attachments, { quoteId, quotePubkey });

        const mentionTargets = await resolveMentionTargets(text, fetchMentionTargets);
        if (mentionTargets.length > 0 && sentMessageId) {
          const senderSummary = pubkey ? resolveProfileSummary(pubkey) : null;
          const fallbackSenderName =
            (pubkey ? shortenPubkey(pubkey) : user?.username?.trim()) ?? undefined;
          const senderName = senderSummary?.displayName?.trim() || fallbackSenderName || "a community member";
          const notificationMessage = `You were mentioned by ${senderName} in ${CASUAL_ROOM_NAME}.`;
          const mentionNotifications = mentionTargets.map((target, index) => ({
            id: `${CASUAL_MENTION_GROUP_ID}-${target.pubkey}-${Date.now()}-${index}`,
            user: senderName,
            message: notificationMessage,
            threadLabel: "View message",
            targetView: "casual" as const,
            targetMessageId: sentMessageId,
          }));
          setNotificationGroups((prev) => {
            let hasMentionGroup = false;
            const nextGroups = prev.map((group) => {
              if (group.id !== CASUAL_MENTION_GROUP_ID) {
                return group;
              }
              hasMentionGroup = true;
              return {
                ...group,
                notifications: [...mentionNotifications, ...group.notifications],
              };
            });
            if (!hasMentionGroup) {
              nextGroups.push({
                id: CASUAL_MENTION_GROUP_ID,
                title: `${CASUAL_ROOM_NAME} mentions`,
                context: "Mentions from the community chat",
                notifications: mentionNotifications,
              });
            }
            return nextGroups;
          });
          setUnreadNotificationIds((prev) => {
            const next = new Set<string>(prev);
            mentionNotifications.forEach((notification) => next.add(notification.id));
            return next;
          });
        }

        setComposerDraft(undefined);
        setQuoteContext(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setComposerError(message);
        throw error;
      }
    },
    [
      fetchMentionTargets,
      handleSend,
      pubkey,
      quoteContext,
      resolveProfileSummary,
      shortenPubkey,
      user?.username,
    ],
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
  const handleNotificationSelect = useCallback(
    (notification: CommunityNotification) => {
      if (!notification.targetView) {
        return;
      }
      setPendingNotificationTarget({
        view: notification.targetView,
        messageId: notification.targetMessageId ?? null,
        postId: notification.targetPostId ?? null,
      });
      setActiveView(notification.targetView);
    },
    [setActiveView, setPendingNotificationTarget],
  );
  useEffect(() => {
    if (!pendingNotificationTarget) {
      return;
    }
    if (activeView !== pendingNotificationTarget.view) {
      return;
    }
    if (pendingNotificationTarget.view === "feed" && pendingNotificationTarget.postId) {
      handleThreadRouteChange(pendingNotificationTarget.postId);
    }
    if (pendingNotificationTarget.view === "casual" && pendingNotificationTarget.messageId) {
      const messageId = pendingNotificationTarget.messageId;
      const scrollToTarget = () => handleScrollToMessage(messageId);
      if (typeof window !== "undefined") {
        window.setTimeout(scrollToTarget, 120);
      } else {
        scrollToTarget();
      }
    }
    setPendingNotificationTarget(null);
  }, [
    activeView,
    handleScrollToMessage,
    handleThreadRouteChange,
    pendingNotificationTarget,
    setPendingNotificationTarget,
  ]);

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

  const composerPanel = (
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
        fetchMentionCandidates={fetchMentionCandidates}
        mentionCandidates={localMentionCandidates}
      />
    </div>
  );

  const composerOverlay = !isCasualView
    ? null
    : typeof document !== "undefined"
      ? createPortal(
          <div
            ref={composerContainerRef}
            className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4 backdrop-blur sm:px-8 lg:left-80"
          >
            {composerPanel}
          </div>,
          document.body,
        )
      : (
          <div
            ref={composerContainerRef}
            className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4 backdrop-blur sm:px-8 lg:left-80"
          >
            {composerPanel}
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
            <span className="flex items-center gap-2">
              <span>Messages</span>
              {hasUnreadMessages && !isMessagesRouteActive && (
                <span aria-hidden="true" className="text-brand text-xs leading-none">
                  ●
                </span>
              )}
            </span>
            {hasUnreadMessages && !isMessagesRouteActive && (
              <span className="sr-only">Unread messages available</span>
            )}
          </NavLink>
          <div className="mt-2">{renderTabButton(NOTIFICATIONS_TAB, "desktop")}</div>
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
                className="relative flex h-full flex-1 min-h-0 flex-col"
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
                          const sanitizedHtml = stripImagePlaceholders(renderedHtml ?? "");
                          const normalizedHtml = sanitizedHtml.replace(/<br\s*\/?>(\s|&nbsp;|\u00a0)*/gi, "");
                          const hasRenderableHtml = normalizedHtml.trim().length > 0;
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

                                    {hasRenderableHtml && (
                                      <div
                                        className={`prose prose-sm max-w-none whitespace-pre-wrap break-words ${
                                          isSelf ? "prose-invert" : "text-[var(--fg-default)]"
                                        } prose-a:text-brand`}
                                        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                                      />
                                    )}

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
              </section>
            ) : isPublicFeedView ? (
              <section
                id="community-panel-feed"
                role="tabpanel"
                aria-labelledby="community-tab-feed"
                className="relative flex h-full flex-1 min-h-0"
              >
                <ErrorBoundary fallback={feedFallback}>
                  <div className="relative flex h-full flex-1 min-h-0 overflow-hidden">
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
                className="relative flex h-full flex-1 min-h-0"
              >
                <ErrorBoundary fallback={feedFallback}>
                  <div className="relative flex h-full flex-1 min-h-0 overflow-hidden">
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
            ) : isNotificationsView ? (
              <section
                id="community-panel-notifications"
                role="tabpanel"
                aria-labelledby="community-tab-notifications"
                className="flex flex-1 flex-col"
              >
                <div className="flex flex-1 flex-col overflow-hidden px-5 py-6 sm:px-8">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)]">
                    Notifications
                  </h2>
                  <div className="mt-5 flex-1 overflow-y-auto pr-1">
                    <ul className="space-y-4">
                      {notificationGroups
                        .filter((group) => group.notifications.length > 0)
                        .map((group) => (
                        <li
                          key={group.id}
                          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/80 p-4 shadow-sm"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--fg-muted)]">
                                {group.title}
                              </p>
                              <span className="rounded-full bg-[var(--bg-muted)]/40 px-3 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--fg-muted)]">
                                {Math.min(group.notifications.length, 3)} update
                                {Math.min(group.notifications.length, 3) === 1 ? "" : "s"}
                              </span>
                            </div>
                            <div className="space-y-2">
                              {group.notifications.slice(0, 3).map((notification) => (
                                <div
                                  key={notification.id}
                                  className="flex flex-col gap-3 rounded-xl bg-[var(--bg-subtle)]/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div>
                                    <p className="text-sm font-medium text-[var(--fg-default)]">
                                      {notification.user}
                                    </p>
                                    <p className="text-xs text-[var(--fg-muted)]">
                                      {notification.message ?? group.context}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleNotificationSelect(notification)}
                                    disabled={!notification.targetView}
                                    className={`inline-flex items-center justify-center rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-medium text-[var(--fg-muted)] transition ${
                                      notification.targetView
                                        ? "hover:border-[var(--border-strong)] hover:text-[var(--fg-default)]"
                                        : "cursor-not-allowed opacity-60"
                                    }`}
                                  >
                                    {notification.threadLabel ?? "View thread"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
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

      {composerOverlay}

    </div>
  );
};

const Community: React.FC = () => (
  <CommunityTranslationProvider>
    <CommunityView />
  </CommunityTranslationProvider>
);

export default Community;
