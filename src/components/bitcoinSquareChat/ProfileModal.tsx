import React, { useEffect } from "react";
import { createPortal } from "react-dom";

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  pubkey: string | null;
  profile: {
    displayName: string;
    avatarUrl: string;
    memberSince?: string | null;
    totalPosts?: number | null;
    rank?: string | null;
  } | null;
  status: "loading" | "success" | "error";
  error?: string;
  fallbackAvatar?: string;
  formatMemberSince: (value?: string | null) => string;
  shortenPubkey: (pubkey: string) => string;
}

const ProfileModal: React.FC<ProfileModalProps> = ({
  open,
  onClose,
  pubkey,
  profile,
  status,
  error,
  fallbackAvatar,
  formatMemberSince,
  shortenPubkey,
}) => {
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  const avatar = profile?.avatarUrl ?? fallbackAvatar ?? undefined;
  const displayName = profile?.displayName ?? (pubkey ? shortenPubkey(pubkey) : "Anonymous user");

  const memberSince = profile ? formatMemberSince(profile.memberSince) : "—";
  const totalPosts =
    typeof profile?.totalPosts === "number" && Number.isFinite(profile.totalPosts)
      ? profile.totalPosts.toLocaleString()
      : "—";
  const rank = profile?.rank ?? "—";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 overflow-hidden rounded-full border border-[var(--border-subtle)]">
              {avatar ? (
                <img
                  src={avatar}
                  alt="Profile"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[var(--bg-muted)] text-lg font-semibold text-[var(--fg-muted)]">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h2 id="profile-modal-title" className="text-xl font-semibold text-[var(--fg-default)]">
                {displayName}
              </h2>
              {pubkey && (
                <p className="mt-1 text-xs text-[var(--fg-muted)]">
                  {shortenPubkey(pubkey)}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4 text-sm text-[var(--fg-default)]">
          {status === "loading" && (
            <p className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3 text-center text-[var(--fg-muted)]">
              Loading profile…
            </p>
          )}

          {status === "error" && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
              {error ?? "We couldn’t load this profile right now."}
            </p>
          )}

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                Member since
              </dt>
              <dd className="mt-1 text-sm font-medium text-[var(--fg-default)]">{memberSince}</dd>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                Total posts
              </dt>
              <dd className="mt-1 text-sm font-medium text-[var(--fg-default)]">{totalPosts}</dd>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3 sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                Community rank
              </dt>
              <dd className="mt-1 text-sm font-medium text-[var(--fg-default)]">{rank}</dd>
            </div>
          </dl>

          <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3 text-xs text-[var(--fg-muted)]">
            Profiles are provided by BitcoinSquare.io. Data shown here reflects the
            latest information available for this Nostr public key.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ProfileModal;
