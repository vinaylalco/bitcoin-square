import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";

import BitcoinSquareFeed from "../components/bitcoinSquareChat/BitcoinSquareFeed";
import ProfileCard from "../components/profile/ProfileCard";
import ProfileModal from "../components/profile/ProfileModal";
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
import { useAuth } from "../context/AuthContext";
import { useNostrAccount } from "../hooks/useNostrAccount";
import { setNostrClientSigner } from "../lib/nostrClient";
import { Heart, MessageCircle, MessageSquareQuote, Zap } from "lucide-react";

const CASUAL_ROOM: RoomDefinition = {
  id: CASUAL_ROOM_ID,
  name: CASUAL_ROOM_NAME,
  type: "private",
  hasLocalKey: true,
};

type PendingAttachment = MediaUploadResult & { previewUrl?: string | null };

type AttachmentStatus = "idle" | "loading" | "ready" | "error";

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

const formatLastSeenLabel = (unixSeconds: number) => {
  const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diffSeconds < 60) return "Active now";
  if (diffSeconds < 3600) return `Active ${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86_400) return `Active ${Math.floor(diffSeconds / 3600)}h ago`;
  return `Active ${Math.floor(diffSeconds / 86_400)}d ago`;
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
}) => {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const remaining = 500 - value.length;

  useEffect(() => {
    if (typeof draft === "string") {
      setValue(draft);
    }
  }, [draft]);

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
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
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
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || isSending}
        rows={3}
        maxLength={500}
        placeholder={disabled ? "Your BitcoinSquare keys must be ready before posting" : "Share an update…"}
        className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3 text-sm leading-relaxed text-[var(--fg-default)] shadow-sm focus:border-brand focus:outline-none"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--fg-muted)]">
        <span>{remaining} characters remaining</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploadStatus === "uploading"}
            className="rounded-full border border-[var(--border-subtle)] px-3 py-1 font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploadStatus === "uploading" ? `Uploading… ${uploadProgress}%` : "Add media"}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={disabled || isSending || value.trim().length === 0}
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? "Sending…" : "Send"}
          </button>
        </div>
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

      {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
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

const Community: React.FC = () => {
  const {
    roomId,
    messages,
    sendMessage,
    pubkey,
    ready,
    roomKeyError,
    error: sendError,
  } = useBitcoinSquareCasualChat();

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
  } = useBitcoinSquareFeed();
  const { user, refreshNostrKeys } = useAuth();
  const {
    ready: accountReady,
    loading: accountLoading,
    signEvent: globalSignEvent,
    pubkey: accountPubkey,
    error: accountError,
  } = useNostrAccount();

  const [activeView, setActiveView] = useState<"casual" | "feed">("casual");
  const listRef = useRef<HTMLDivElement | null>(null);
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
  const { requestProfile, resolveProfileSummary, openProfile } = useProfileIdentity();

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
    if (activeView !== "casual") return;
    if (!listRef.current) return;
    listRef.current.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [activeView, messages.length]);

  useEffect(() => {
    const uniquePubkeys = new Set<string>();
    messages.forEach((message) => uniquePubkeys.add(message.pubkey));
    feedPosts.forEach((post) => uniquePubkeys.add(post.pubkey));
    uniquePubkeys.forEach((pubkeyValue) => {
      requestProfile(pubkeyValue).catch(() => undefined);
    });
  }, [feedPosts, messages, requestProfile]);

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

  const onlineMembers = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const recencyWindow = 60 * 60 * 6;
    const seen = new Map<string, number>();
    messages.forEach((message) => {
      if (now - message.created_at <= recencyWindow) {
        seen.set(message.pubkey, Math.max(seen.get(message.pubkey) ?? 0, message.created_at));
      }
    });
    feedPosts.forEach((post) => {
      if (now - post.created_at <= recencyWindow) {
        seen.set(post.pubkey, Math.max(seen.get(post.pubkey) ?? 0, post.created_at));
      }
    });
    if (pubkey) {
      seen.set(pubkey, now);
    }
    return Array.from(seen.entries())
      .map(([pubkeyValue, lastSeen]) => ({ pubkey: pubkeyValue, lastSeen }))
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, 24);
  }, [feedPosts, messages, pubkey]);

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
    async (text: string) => {
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
      await sendMessage(text, attachments);
      setPendingAttachments([]);
      setComposerError(null);
    },
    [pendingAttachments, sendMessage],
  );

  const handleComposerSend = useCallback(
    async (text: string) => {
      try {
        await handleSend(text);
        setComposerDraft(undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setComposerError(message);
        throw error;
      }
    },
    [handleSend],
  );

  const isCasualView = activeView === "casual";

  const handleReplyToMessage = useCallback(
    (message: CasualChatMessage) => {
      setComposerDraft(`@${shortenPubkey(message.pubkey)} `);
    },
    [shortenPubkey],
  );

  const handleQuoteMessage = useCallback((message: CasualChatMessage) => {
    const quoted = message.markdown
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join("\n");
    setComposerDraft(`${quoted}\n\n`);
  }, []);

  const handleLikeMessage = useCallback(
    async (message: CasualChatMessage) => {
      try {
        await sendMessage(`❤️ ${shortenPubkey(message.pubkey)}`);
      } catch (reactionError) {
        const messageText = reactionError instanceof Error ? reactionError.message : String(reactionError);
        setComposerError(messageText);
      }
    },
    [sendMessage, shortenPubkey],
  );

  const handleSendLightning = useCallback(
    (address: string) => {
      if (!address) return;
      if (!user?.lnWalletAddress) {
        setWalletPromptOpen(true);
        return;
      }
      const target = address.startsWith("lightning:") ? address : `lightning:${address}`;
      if (typeof window === "undefined") {
        void navigator.clipboard?.writeText(address);
        return;
      }
      try {
        window.open(target, "_blank", "noopener,noreferrer");
      } catch (error) {
        try {
          void navigator.clipboard?.writeText(address);
        } catch {
          // ignore copy failures
        }
      }
    },
    [user?.lnWalletAddress],
  );

  const gatingResult = renderContent();
  if (gatingResult) {
    return gatingResult;
  }

  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-gradient-to-br from-amber-50 via-white to-rose-50 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.25),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.2),transparent_45%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.12),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.15),transparent_45%)]" />
      <div className="relative z-0 flex min-h-screen w-full">
        <aside className="hidden w-80 flex-col border-r border-white/40 bg-white/30 px-5 py-8 shadow-sm backdrop-blur lg:flex dark:border-neutral-800 dark:bg-neutral-900/60">
          <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--fg-muted)]">Active members</h2>
          <div className="mt-6 space-y-3 overflow-y-auto pr-1">
            {onlineMembers.length === 0 ? (
              <p className="rounded-2xl bg-white/60 p-4 text-xs text-[var(--fg-muted)] shadow-sm dark:bg-neutral-900/50">
                We&apos;ll show members here as they join the conversation.
              </p>
            ) : (
              onlineMembers.map(({ pubkey: memberKey, lastSeen }) => {
                const memberSummary = resolveProfileSummary(memberKey);
                return (
                  <button
                    key={memberKey}
                    type="button"
                    onClick={() => openProfile(memberKey)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/60 bg-white/80 px-3 py-2 text-left shadow-sm transition hover:border-brand hover:text-brand dark:border-neutral-800 dark:bg-neutral-900/70"
                  >
                    <img
                      src={memberSummary.avatarUrl}
                      alt={memberSummary.displayName}
                      className="h-9 w-9 rounded-full border border-white/80 object-cover shadow-sm"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-[var(--fg-default)]">{memberSummary.displayName}</span>
                      <span className="truncate text-[10px] uppercase tracking-[0.24em] text-[var(--fg-muted)]">
                        {formatLastSeenLabel(memberKey === pubkey ? Math.floor(Date.now() / 1000) : lastSeen)}
                      </span>
                    </div>
                    {memberSummary.lightningAddress && <Zap className="h-4 w-4 text-brand" />}
                  </button>
                );
              })
            )}
          </div>
        </aside>
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-center border-b border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-5 shadow-sm">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-app)]/70 p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveView("casual")}
                className={`rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-[0.24em] transition ${
                  isCasualView ? "bg-brand text-white shadow" : "text-[var(--fg-muted)] hover:text-brand"
                }`}
              >
                Casual Chat
              </button>
              <button
                type="button"
                onClick={() => setActiveView("feed")}
                className={`rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-[0.24em] transition ${
                  !isCasualView ? "bg-brand text-white shadow" : "text-[var(--fg-muted)] hover:text-brand"
                }`}
              >
                Community Feed
              </button>
            </div>
          </header>
          <main className="relative flex flex-1 flex-col overflow-hidden">
            {isCasualView ? (
              <>
                <div ref={listRef} className="flex-1 overflow-y-auto px-4 pb-56 pt-6 sm:px-8">
                  {messages.map((message) => {
                    const summary = resolveProfileSummary(message.pubkey);
                    const isSelf = message.pubkey === pubkey;
                    const bubbleBase = isSelf
                      ? "bg-brand text-white shadow-xl"
                      : "bg-white/85 text-[var(--fg-default)] shadow-sm dark:bg-neutral-900/70";
                    const timestampColor = isSelf ? "text-white/80" : "text-[var(--fg-muted)]";
                    return (
                      <div key={message.id} className={`flex w-full ${isSelf ? "justify-end" : "justify-start"} py-2`}>
                        <div className={`flex max-w-[min(80%,32rem)] items-end gap-3 ${isSelf ? "flex-row-reverse" : ""}`}>
                          <button
                            type="button"
                            onClick={() => openProfile(message.pubkey)}
                            className="group flex-shrink-0"
                          >
                            <img
                              src={summary.avatarUrl}
                              alt={summary.displayName}
                              className="h-10 w-10 rounded-full border border-white/80 object-cover shadow-sm transition group-hover:ring-2 group-hover:ring-brand dark:border-neutral-700"
                            />
                            <span className="sr-only">Open profile</span>
                          </button>
                          <div className={`space-y-3 rounded-3xl px-4 py-3 backdrop-blur ${bubbleBase}`}>
                            <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.24em]">
                              <span className={`font-semibold ${isSelf ? "text-white" : "text-[var(--fg-default)]"}`}>
                                {summary.displayName}
                              </span>
                              <span className={timestampColor}>{formatTimestamp(message.created_at)}</span>
                            </div>
                            <div
                              className={`prose prose-sm max-w-none whitespace-pre-wrap break-words ${
                                isSelf ? "prose-invert" : "text-[var(--fg-default)]"
                              } prose-a:text-brand`}
                              dangerouslySetInnerHTML={{ __html: message.html }}
                            />
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
                                onClick={() => handleReplyToMessage(message)}
                                disabled={!ready}
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                                  isSelf
                                    ? "border-white/60 text-white"
                                    : "border-white/70 text-[var(--fg-muted)] hover:border-brand hover:text-brand"
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                                title="Reply"
                              >
                                <MessageCircle className="h-4 w-4" />
                                <span className="sr-only">Reply</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuoteMessage(message)}
                                disabled={!ready}
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                                  isSelf
                                    ? "border-white/60 text-white"
                                    : "border-white/70 text-[var(--fg-muted)] hover:border-brand hover:text-brand"
                                } disabled:cursor-not-allowed disabled:opacity-60`}
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
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                                title="Send a like"
                              >
                                <Heart className="h-4 w-4" />
                                <span className="sr-only">Like</span>
                              </button>
                              {summary.lightningAddress && (
                                <button
                                  type="button"
                                  onClick={() => handleSendLightning(summary.lightningAddress!)}
                                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                                    user?.lnWalletAddress
                                      ? "border-brand/40 text-white hover:border-brand dark:text-brand"
                                      : "border-dashed border-white/60 text-white/80 dark:text-[var(--fg-muted)]"
                                  }`}
                                  title={
                                    user?.lnWalletAddress
                                      ? "Send sats via Lightning"
                                      : "Add your Lightning address to zap from here"
                                  }
                                >
                                  <Zap className="h-4 w-4" />
                                  <span className="sr-only">Send sats</span>
                                </button>
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
                    );
                  })}
                </div>
                <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-3 sm:px-8">
                  <div className="pointer-events-auto mx-auto w-full max-w-3xl rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/95 px-4 py-4 shadow-xl backdrop-blur">
                    {roomKeyError && <p className="mb-3 text-sm text-red-500">{roomKeyError}</p>}
                    {sendError && <p className="mb-3 text-sm text-red-500">{sendError}</p>}
                    {composerError && <p className="mb-3 text-sm text-red-500">{composerError}</p>}
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
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full flex-1 overflow-hidden">
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
                  onSendLightning={handleSendLightning}
                  canZap={Boolean(user?.lnWalletAddress)}
                  pubkey={feedPubkey}
                />
              </div>
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

      <ProfileModal />
    </div>
  );
};

export default Community;
