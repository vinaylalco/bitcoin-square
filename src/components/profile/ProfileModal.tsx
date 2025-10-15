import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

import ErrorBoundary from "../ErrorBoundary";
import {
  PROFILE_FALLBACK_MESSAGE,
  PROFILE_STALE_MESSAGE,
  PROFILE_UNAVAILABLE_MESSAGE,
  formatMemberSince,
  useProfileIdentity,
  useUserProfile,
} from "../../context/ProfileIdentityContext";
import type { ProfileSummary } from "../../context/ProfileIdentityContext";
const PORTAL_ELEMENT_ID = "profile-modal-root";
const REPUTATION_TOOLTIP =
  "Weighted blend of engagement (40%), trust (30%), longevity (20%), contribution (10%) over last 30 days. Scaled 0–100.";
const RANK_TOOLTIP = "Percentile among active members. Calculated from Reputation vs peers.";
const STATS_EXPLANATION =
  "Scores refresh when you open a profile, using the last 30 days of verified community activity.";

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
  const memberSince = formatMemberSince(profile?.joined);
  const totalPosts = profile?.totalPosts != null ? profile.totalPosts.toLocaleString() : "—";
  const reputationFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      }),
    [],
  );
  const reputation =
    profile?.reputationScore != null
      ? reputationFormatter.format(profile.reputationScore)
      : "—";
  const rank = profile?.rank ?? "—";
  const followerCount = Array.isArray(profile?.followers)
    ? profile?.followers?.length ?? 0
    : null;
  const followingCount = Array.isArray(profile?.following)
    ? profile?.following?.length ?? 0
    : null;
  const followerLabel = followerCount != null ? followerCount.toLocaleString() : "—";
  const followingLabel = followingCount != null ? followingCount.toLocaleString() : "—";

  const badges = useMemo(() => {
    if (!profile) return [] as string[];
    if (Array.isArray(profile.badges) && profile.badges.length > 0) {
      return profile.badges;
    }
    if (Array.isArray(profile.achievements) && profile.achievements.length > 0) {
      return profile.achievements;
    }
    return [] as string[];
  }, [profile]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-2xl">
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

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Member since</dt>
              <dd
                className="mt-1 text-sm font-medium text-[var(--fg-default)]"
                title={profile?.joined ?? undefined}
              >
                {memberSince}
              </dd>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Total posts</dt>
              <dd className="mt-1 text-sm font-medium text-[var(--fg-default)]">{totalPosts}</dd>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  Reputation score
                  <Info
                    className="h-3.5 w-3.5 text-[var(--fg-muted)]"
                    aria-hidden="true"
                    title={REPUTATION_TOOLTIP}
                  />
                </span>
              </dt>
              <dd className="mt-1 text-sm font-medium text-[var(--fg-default)]">{reputation}</dd>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3 sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  Community rank
                  <Info
                    className="h-3.5 w-3.5 text-[var(--fg-muted)]"
                    aria-hidden="true"
                    title={RANK_TOOLTIP}
                  />
                </span>
              </dt>
              <dd className="mt-1 text-sm font-medium text-[var(--fg-default)]">{rank}</dd>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Followers</dt>
              <dd className="mt-1 text-sm font-medium text-[var(--fg-default)]">{followerLabel}</dd>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Following</dt>
              <dd className="mt-1 text-sm font-medium text-[var(--fg-default)]">{followingLabel}</dd>
            </div>
          </dl>

          <p className="mt-2 text-[0.65rem] text-[var(--fg-muted)]">
            {STATS_EXPLANATION}
          </p>

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

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-muted)]">Badges & Achievements</h3>
            {badges.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {badges.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-[var(--fg-muted)]">No badges yet.</p>
            )}
          </div>

          {profile?.lightningAddress ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-default)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                  Lightning address
                </span>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(profile.lightningAddress || "").catch(() => undefined)}
                    className="rounded-full border border-[var(--border-subtle)] px-3 py-1 font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
                  >
                    Copy
                  </button>
                  <a
                    href={`lightning:${profile.lightningAddress}`}
                    className="rounded-full border border-brand/40 px-3 py-1 font-semibold uppercase tracking-[0.18em] text-brand transition hover:border-brand"
                  >
                    Open wallet
                  </a>
                </div>
              </div>
              <code className="mt-3 block break-all rounded-xl bg-[var(--bg-card)]/60 px-3 py-2 text-xs text-[var(--fg-default)]">
                {profile.lightningAddress}
              </code>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-xs text-[var(--fg-muted)]">
              Lightning address not shared.
            </div>
          )}

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
