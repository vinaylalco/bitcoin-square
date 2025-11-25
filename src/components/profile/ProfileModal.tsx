import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import ErrorBoundary from "../ErrorBoundary";
import {
  PROFILE_FALLBACK_MESSAGE,
  PROFILE_STALE_MESSAGE,
  PROFILE_UNAVAILABLE_MESSAGE,
  useProfileIdentity,
  useUserProfile,
} from "../../context/ProfileIdentityContext";
import type { ProfileSummary } from "../../context/ProfileIdentityContext";
const PORTAL_ELEMENT_ID = "profile-modal-root";
const useProfileModalPortalNode = () => {
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    let portal = document.getElementById(PORTAL_ELEMENT_ID) as HTMLElement | null;
    if (!portal) {
      portal = document.createElement("div");
      portal.id = PORTAL_ELEMENT_ID;
      document.body.appendChild(portal);
    }

    setNode(portal);

    return () => {
      if (portal && portal.parentElement) {
        portal.parentElement.removeChild(portal);
      }
    };
  }, []);

  return node;
};

interface ProfileModalBodyProps {
  avatarLoaded: boolean;
  onAvatarLoaded: () => void;
  onClose: () => void;
  onRefresh: () => void;
  onFollow: () => void;
  onMessage: () => void;
  summary: ProfileSummary;
  shortenPubkey: (pubkey: string) => string;
  activeProfile: string;
  profile: ReturnType<typeof useUserProfile>["profile"];
  status: ReturnType<typeof useUserProfile>["status"];
  error: ReturnType<typeof useUserProfile>["error"];
  stale: ReturnType<typeof useUserProfile>["stale"];
  following: boolean;
}

const ProfileModalBody: React.FC<ProfileModalBodyProps> = ({
  avatarLoaded,
  onAvatarLoaded,
  onClose,
  onRefresh,
  onFollow,
  onMessage,
  summary,
  shortenPubkey,
  activeProfile,
  profile,
  status,
  error,
  stale,
  following,
}) => {
  const isUnavailable = status === "error" || status === "unavailable";
  const fallbackMessage = stale
    ? "Showing the last saved version of this profile. Some details may be out of date."
    : "Some profile details are unavailable right now.";
  const statusMessage = isUnavailable
    ? error &&
      ![PROFILE_FALLBACK_MESSAGE, PROFILE_UNAVAILABLE_MESSAGE, PROFILE_STALE_MESSAGE].includes(error)
      ? error
      : fallbackMessage
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg overflow-auto rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <a
              href={summary.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="relative block h-20 w-20 overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--bg-muted)] shadow-lg transition hover:border-brand"
              title={`Open ${summary.displayName}'s profile in a new tab`}
            >
              <img
                src={summary.avatarUrl}
                alt={summary.displayName}
                loading="lazy"
                onLoad={onAvatarLoaded}
                className={`h-full w-full object-cover transition-opacity duration-500 ${avatarLoaded ? "opacity-100" : "opacity-0"}`}
              />
              <span className="sr-only">Open full profile</span>
            </a>
            <div>
              <h2 className="text-2xl font-semibold text-[var(--fg-default)]">{summary.displayName}</h2>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                {shortenPubkey(activeProfile)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
          >
            Close
          </button>
        </header>

        <section className="mt-6 space-y-4 text-sm text-[var(--fg-default)]">
          {status === "loading" && (
            <p className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3 text-center text-[var(--fg-muted)]">
              Loading profile…
            </p>
          )}

          {statusMessage && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-500">
              <p>{statusMessage}</p>
              <button
                type="button"
                onClick={onRefresh}
                className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-500/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-500 transition hover:border-amber-500 hover:bg-amber-500/10"
              >
                Retry
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onFollow}
              aria-pressed={following}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                following
                  ? "border-brand bg-brand/10 text-brand hover:bg-brand/20"
                  : "border-[var(--border-subtle)] text-[var(--fg-default)] hover:border-brand hover:text-brand"
              }`}
            >
              {following ? "Unfollow" : "Follow"}
            </button>
            <button
              type="button"
              onClick={onMessage}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-default)] transition hover:border-brand hover:text-brand"
            >
              Message
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-default)] transition hover:border-brand hover:text-brand"
            >
              Refresh
            </button>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 p-4 text-sm text-[var(--fg-default)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-muted)]">Profile details</p>
            <p className="mt-2 text-sm text-[var(--fg-muted)]">Some profile details are not displayed.</p>
          </div>

          <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3 text-xs text-[var(--fg-muted)]">
            Profiles are provided by BitcoinSquare.io. Data reflects the latest information available for this Nostr public key.
          </p>
        </section>
      </div>
    </div>
  );
};

const ProfileModalPortal: React.FC = () => {
  const {
    activeProfile,
    closeProfile,
    resolveProfileSummary,
    toggleFollow,
    isFollowing,
    startDirectMessage,
    shortenPubkey,
  } = useProfileIdentity();
  const { profile, status, error, refresh, stale } = useUserProfile(activeProfile);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const portalNode = useProfileModalPortalNode();

  useEffect(() => {
    setAvatarLoaded(false);
  }, [profile?.avatarUrl, activeProfile]);

  useEffect(() => {
    if (!activeProfile || typeof window === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeProfile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeProfile, closeProfile]);

  const summary = useMemo(
    () => (activeProfile ? resolveProfileSummary(activeProfile) : null),
    [activeProfile, resolveProfileSummary],
  );

  const following = useMemo(
    () => (activeProfile ? isFollowing(activeProfile) : false),
    [activeProfile, isFollowing],
  );

  const shouldRenderModal = Boolean(activeProfile && summary);
  if (!portalNode || !shouldRenderModal || !summary || !activeProfile) {
    return null;
  }

  const fallback = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-3xl border border-red-500/30 bg-[var(--bg-card)] p-6 text-center text-sm text-red-500 shadow-xl">
        <p>We hit a snag rendering this profile.</p>
        <button
          type="button"
          onClick={closeProfile}
          className="mt-4 inline-flex items-center justify-center rounded-full border border-red-500/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-red-500 transition hover:border-red-500"
        >
          Close
        </button>
      </div>
    </div>
  );

  return createPortal(
    <ErrorBoundary fallback={fallback}>
      <ProfileModalBody
        avatarLoaded={avatarLoaded}
        onAvatarLoaded={() => setAvatarLoaded(true)}
        onClose={closeProfile}
        onRefresh={() => refresh().catch(() => undefined)}
        onFollow={() => toggleFollow(activeProfile)}
        onMessage={() => {
          startDirectMessage(activeProfile);
          closeProfile();
        }}
        summary={summary}
        shortenPubkey={shortenPubkey}
        activeProfile={activeProfile}
        profile={profile}
        status={status}
        error={error}
        stale={stale}
        following={following}
      />
    </ErrorBoundary>,
    portalNode,
  );
};

export default ProfileModalPortal;
export { ProfileModalPortal };
