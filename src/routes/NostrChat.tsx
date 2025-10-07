import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import BitcoinSquareFeed from "../components/bitcoinSquareChat/BitcoinSquareFeed";
import ProfileCard from "../components/profile/ProfileCard";
import ProfileModal from "../components/profile/ProfileModal";
import type { RoomDefinition } from "../components/RoomList";
import { CASUAL_ROOM_ID, CASUAL_ROOM_NAME, useBitcoinSquareCasualChat } from "../hooks/useBitcoinSquareCasualChat";
import type { CasualAttachmentMeta } from "../hooks/useBitcoinSquareCasualChat";
import { useMediaUploader, type MediaUploadResult, type UseMediaUploaderReturn } from "../hooks/useMediaUploader";
import { useBitcoinSquareFeed } from "../hooks/useBitcoinSquareFeed";
import { decryptBinary } from "../utils/aes";
import { getCachedMediaBlob, getCachedPreview, setCachedMediaBlob, setCachedPreview } from "../utils/mediaCache";
import { useProfileIdentity, shortenPubkey } from "../context/ProfileIdentityContext";

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
}> = ({
  disabled,
  onSend,
  onUploadFile,
  pendingAttachments,
  onRemoveAttachment,
  uploadStatus,
  uploadProgress,
  uploadError,
}) => {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const remaining = 500 - value.length;

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
        placeholder={disabled ? "Connect your NIP-07 signer and import the room key" : "Share an update…"}
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

const NostrChat: React.FC = () => {
  const {
    roomId,
    roomName,
    messages,
    sendMessage,
    pubkey,
    loading,
    ready,
    hasRoomKey,
    roomKeyError,
    error: sendError,
    importGroupKey,
    exportGroupKey,
  } = useBitcoinSquareCasualChat();

  const {
    posts: feedPosts,
    ready: feedReady,
    publishing: feedPublishing,
    publishStatus: publishFeedStatus,
    likePost: likeFeedPost,
    repostPost: repostFeedPost,
    loadMore: loadMoreFeed,
    loadingMore: feedLoadingMore,
    hasMore: feedHasMore,
    error: feedError,
  } = useBitcoinSquareFeed();

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
  const { requestProfile, resolveProfileSummary } = useProfileIdentity();

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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setComposerError(message);
        throw error;
      }
    },
    [handleSend],
  );

  const handleImportKey = useCallback(async () => {
    const payload = window.prompt("Paste the shared group key payload");
    if (!payload) return;
    const sender = window.prompt(
      "Enter the sender's pubkey (optional, used when the payload is NIP-04 encrypted)",
    );
    try {
      await importGroupKey(payload.trim(), sender?.trim() ? sender.trim() : undefined);
      window.alert("Room key imported successfully");
    } catch (error) {
      console.error("Failed to import group key", error);
      window.alert("Failed to import key. Please verify the payload and try again.");
    }
  }, [importGroupKey]);

  const handleExportKey = useCallback(async () => {
    const recipient = window.prompt("Recipient pubkey (optional)") ?? undefined;
    try {
      const payload = await exportGroupKey(recipient?.trim() ? recipient.trim() : undefined);
      window.prompt("Share this payload securely with new members", payload);
    } catch (error) {
      console.error("Failed to export group key", error);
      window.alert("We couldn't export the key. Try again later.");
    }
  }, [exportGroupKey]);

  const isCasualView = activeView === "casual";

  return (
    <div className="flex h-full flex-col bg-[var(--bg-app)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold uppercase tracking-[0.24em] text-[var(--fg-default)]">
              {isCasualView ? roomName : "BitcoinSquare Feed"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--fg-muted)]">
              {isCasualView
                ? "A cozy, encrypted hangout for BitcoinSquare members. Messages are limited to 500 characters, support emojis and Markdown, and every upload is encrypted end-to-end before it hits the relay."
                : "Catch the latest public updates from the BitcoinSquare community. Posts come directly from Nostr relays with the #bitcoinsquare-feed tag."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
            <button
              type="button"
              onClick={() => setActiveView("casual")}
              className={`rounded-full border px-3 py-1 transition ${
                isCasualView
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-[var(--border-subtle)] text-[var(--fg-muted)] hover:border-brand hover:text-brand"
              }`}
            >
              Casual Chat
            </button>
            <button
              type="button"
              onClick={() => setActiveView("feed")}
              className={`rounded-full border px-3 py-1 transition ${
                !isCasualView
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-[var(--border-subtle)] text-[var(--fg-muted)] hover:border-brand hover:text-brand"
              }`}
            >
              Community Feed
            </button>
          </div>
        </div>
        {isCasualView ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--fg-muted)]">
            <span>Room tag: #{`room:${roomId}`}</span>
            <button
              type="button"
              onClick={handleImportKey}
              className="rounded-full border border-[var(--border-subtle)] px-3 py-1 font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
            >
              Import key
            </button>
            <button
              type="button"
              onClick={handleExportKey}
              className="rounded-full border border-[var(--border-subtle)] px-3 py-1 font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
            >
              Export key
            </button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-[var(--fg-muted)]">
            Streaming public notes tagged #bitcoinsquare-feed with optimistic delivery and offline caching.
          </p>
        )}
      </header>

      <main className="flex flex-1 flex-col overflow-hidden">
        {isCasualView ? (
          <>
            <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {loading && <p className="text-sm text-[var(--fg-muted)]">Loading recent messages…</p>}

          {!loading && messages.length === 0 && (
            <p className="text-sm text-[var(--fg-muted)]">No messages yet. Be the first to say hello!</p>
          )}

          {messages.map((message) => {
            const summary = resolveProfileSummary(message.pubkey);

            return (
              <article
                key={message.id}
                className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm transition hover:border-brand/60"
              >
                <div className="flex items-start justify-between gap-4">
                  <ProfileCard
                    pubkey={message.pubkey}
                    contentClassName="items-start"
                    className="flex-1"
                    subtitle={shortenPubkey(message.pubkey)}
                    meta={
                      <span className="text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                        {formatTimestamp(message.created_at)}
                      </span>
                    }
                  />

                  <a
                    href={summary.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
                  >
                    View profile
                  </a>
                </div>

                <div
                  className="prose prose-invert mt-4 max-w-none whitespace-pre-wrap text-sm leading-relaxed text-[var(--fg-default)] prose-a:text-brand prose-blockquote:border-brand/40"
                  dangerouslySetInnerHTML={{ __html: message.html }}
                />

                {message.attachments.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {message.attachments.map((attachment) => (
                      <AttachmentPreview key={`${message.id}-${attachment.digest}`} attachment={attachment} />
                    ))}
                  </div>
                )}

                {message.status === "pending" && (
                  <p className="mt-3 text-xs text-brand">Sending to relays…</p>
                )}
                {message.status === "failed" && (
                  <p className="mt-3 text-xs text-red-500">
                    {message.error ?? "We couldn't deliver this message."}
                  </p>
                )}
              </article>
            );
          })}
            </div>

            <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-5">
              {!pubkey && (
                <p className="mb-3 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-muted)]">
                  Connect a NIP-07 compatible signer to send messages and upload media.
                </p>
              )}
              {!hasRoomKey && (
                <p className="mb-3 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-muted)]">
                  Import the shared room key to decrypt and send messages in this private space.
                </p>
              )}
              {roomKeyError && (
                <p className="mb-3 text-sm text-red-500">{roomKeyError}</p>
              )}
              {sendError && (
                <p className="mb-3 text-sm text-red-500">{sendError}</p>
              )}
              {composerError && (
                <p className="mb-3 text-sm text-red-500">{composerError}</p>
              )}

              <Composer
                disabled={!ready}
                onSend={handleComposerSend}
                onUploadFile={handleUploadFile}
                pendingAttachments={pendingAttachments}
                onRemoveAttachment={handleRemoveAttachment}
                uploadStatus={uploadStatus}
                uploadProgress={uploadProgress}
                uploadError={uploadError}
              />
            </div>
          </>
        ) : (
          <BitcoinSquareFeed
            posts={feedPosts}
            ready={feedReady}
            publishing={feedPublishing}
            publishStatus={publishFeedStatus}
            likePost={likeFeedPost}
            repostPost={repostFeedPost}
            loadMore={loadMoreFeed}
            loadingMore={feedLoadingMore}
            hasMore={feedHasMore}
            error={feedError}
          />
        )}
      </main>

      <ProfileModal />
    </div>
  );
};

export default NostrChat;
