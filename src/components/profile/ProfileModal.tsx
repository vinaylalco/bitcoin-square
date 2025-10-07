import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  formatMemberSince,
  useProfileIdentity,
  useUserProfile,
} from "../../context/ProfileIdentityContext";

const ProfileModal: React.FC = () => {
  const {
    activeProfile,
    closeProfile,
    resolveProfileSummary,
    toggleFollow,
    isFollowing,
    startDirectMessage,
    shortenPubkey,
  } = useProfileIdentity();

  const { profile, status, error, refresh } = useUserProfile(activeProfile);
  const [avatarLoaded, setAvatarLoaded] = useState(false);

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

  if (!activeProfile) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  const summary = resolveProfileSummary(activeProfile);
  const following = isFollowing(activeProfile);

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

  const handleFollow = () => {
    toggleFollow(activeProfile);
  };

  const handleMessage = () => {
    startDirectMessage(activeProfile);
  };

  const handleRefresh = () => {
    refresh().catch(() => undefined);
  };

  const memberSince = formatMemberSince(profile?.joined);

  const totalPosts = profile?.totalPosts != null ? profile.totalPosts.toLocaleString() : "—";
  const reputation = profile?.reputationScore != null ? profile.reputationScore.toLocaleString() : "—";
  const rank = profile?.rank ?? "—";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-20 w-20 overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--bg-muted)]">
              <img
                src={summary.avatarUrl}
                alt={summary.displayName}
                loading="lazy"
                onLoad={() => setAvatarLoaded(true)}
                className={`h-full w-full object-cover transition-opacity duration-500 ${avatarLoaded ? "opacity-100" : "opacity-0"}`}
              />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-[var(--fg-default)]">{summary.displayName}</h2>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                {shortenPubkey(activeProfile)}
              </p>
              <a
                href={summary.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand transition hover:underline"
              >
                View on BitcoinSquare
              </a>
            </div>
          </div>
          <button
            type="button"
            onClick={closeProfile}
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

          {status === "error" && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
              <p>{error ?? "We couldn’t load this profile."}</p>
              <button
                type="button"
                onClick={handleRefresh}
                className="mt-2 inline-flex items-center gap-2 rounded-full border border-red-500/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-500 transition hover:border-red-500 hover:bg-red-500/10"
              >
                Retry
              </button>
            </div>
          )}

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Member since</dt>
              <dd className="mt-1 text-sm font-medium text-[var(--fg-default)]">{memberSince}</dd>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Total posts</dt>
              <dd className="mt-1 text-sm font-medium text-[var(--fg-default)]">{totalPosts}</dd>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Reputation score</dt>
              <dd className="mt-1 text-sm font-medium text-[var(--fg-default)]">{reputation}</dd>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3 sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Community rank</dt>
              <dd className="mt-1 text-sm font-medium text-[var(--fg-default)]">{rank}</dd>
            </div>
          </dl>

          {profile?.lightningAddress && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-default)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                  Lightning address
                </span>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(profile.lightningAddress || '').catch(() => undefined)}
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
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleFollow}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                following
                  ? "border-brand bg-brand/10 text-brand hover:bg-brand/20"
                  : "border-[var(--border-subtle)] text-[var(--fg-default)] hover:border-brand hover:text-brand"
              }`}
            >
              {following ? "Following" : "Follow"}
            </button>
            <button
              type="button"
              onClick={handleMessage}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-default)] transition hover:border-brand hover:text-brand"
            >
              Message
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-default)] transition hover:border-brand hover:text-brand"
            >
              Refresh
            </button>
          </div>

          {badges.length > 0 && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-muted)]">Badges & Achievements</h3>
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
            </div>
          )}

          <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3 text-xs text-[var(--fg-muted)]">
            Profiles are provided by BitcoinSquare.io. Data reflects the latest information available for this Nostr public key.
          </p>
        </section>
      </div>
    </div>,
    document.body,
  );
};

export default ProfileModal;
