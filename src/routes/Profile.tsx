import React, { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Copy, Info, MessageCircle, RefreshCw } from "lucide-react";

import {
  formatMemberSince,
  useProfileIdentity,
  useUserProfile,
} from "../context/ProfileIdentityContext";

const STATS_EXPLANATION =
  "Stats reflect verified posts, reactions, and follower endorsements recorded on Bitcoin Square. Rankings refresh nightly based on your reputation points.";

const Profile: React.FC = () => {
  const { pubkey } = useParams<{ pubkey: string }>();
  const {
    resolveProfileSummary,
    toggleFollow,
    isFollowing,
    startDirectMessage,
    shortenPubkey,
  } = useProfileIdentity();

  const { profile, status, error, refresh } = useUserProfile(pubkey);

  const summary = useMemo(() => (pubkey ? resolveProfileSummary(pubkey) : null), [pubkey, resolveProfileSummary]);

  if (!pubkey) {
    return <Navigate to="/" replace />;
  }

  const following = isFollowing(pubkey);
  const memberSince = formatMemberSince(profile?.joined);
  const totalPosts = profile?.totalPosts != null ? profile.totalPosts.toLocaleString() : "—";
  const reputation = profile?.reputationScore != null ? profile.reputationScore.toLocaleString() : "—";
  const rank = profile?.rank ?? "—";

  return (
    <div className="min-h-screen overflow-auto bg-[var(--bg-app)] px-4 py-10 text-[var(--fg-default)] sm:px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-col gap-6 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <img
              src={summary?.avatarUrl}
              alt={summary?.displayName}
              className="h-20 w-20 rounded-full border border-[var(--border-subtle)] object-cover"
              loading="lazy"
            />
            <div>
              <h1 className="text-2xl font-semibold">{summary?.displayName ?? shortenPubkey(pubkey)}</h1>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--fg-muted)]">{shortenPubkey(pubkey)}</p>
              <Link
                to="/community"
                className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand transition hover:underline"
              >
                Back to community
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => toggleFollow(pubkey)}
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
              onClick={() => startDirectMessage(pubkey)}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-default)] transition hover:border-brand hover:text-brand"
            >
              <MessageCircle className="h-4 w-4" /> Message
            </button>
            <button
              type="button"
              onClick={() => refresh().catch(() => undefined)}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fg-default)] transition hover:border-brand hover:text-brand"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </header>

        <section className="space-y-5 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm">
          {status === "loading" && (
            <p className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-muted)]">
              Loading profile…
            </p>
          )}
          {status === "error" && (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">
              <p>{error ?? "We couldn’t load this profile."}</p>
              <button
                type="button"
                onClick={() => refresh().catch(() => undefined)}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-red-500/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-500 transition hover:border-red-500 hover:bg-red-500/10"
              >
                Retry
              </button>
            </div>
          )}

          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Member since</dt>
              <dd className="mt-2 text-sm font-medium" title={profile?.joined ?? undefined}>
                {memberSince}
              </dd>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Total posts</dt>
              <dd className="mt-2 text-sm font-medium">{totalPosts}</dd>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  Reputation score
                  <Info
                    className="h-3.5 w-3.5 text-[var(--fg-muted)]"
                    aria-hidden="true"
                    title={STATS_EXPLANATION}
                  />
                </span>
              </dt>
              <dd className="mt-2 text-sm font-medium">{reputation}</dd>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  Community rank
                  <Info
                    className="h-3.5 w-3.5 text-[var(--fg-muted)]"
                    aria-hidden="true"
                    title={STATS_EXPLANATION}
                  />
                </span>
              </dt>
              <dd className="mt-2 text-sm font-medium">{rank}</dd>
            </div>
          </dl>

          <p className="mt-2 text-[0.65rem] text-[var(--fg-muted)]">{STATS_EXPLANATION}</p>

          {profile?.lightningAddress && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-4 text-sm text-[var(--fg-default)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Lightning address</span>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(profile.lightningAddress || "").catch(() => undefined)}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-1 font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)] transition hover:border-brand hover:text-brand"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                  <a
                    href={`lightning:${profile.lightningAddress}`}
                    className="inline-flex items-center gap-2 rounded-full border border-brand/40 px-3 py-1 font-semibold uppercase tracking-[0.18em] text-brand transition hover:border-brand"
                  >
                    Send sats
                  </a>
                </div>
              </div>
              <code className="mt-3 block break-all rounded-xl bg-[var(--bg-card)]/60 px-3 py-2 text-xs">{profile.lightningAddress}</code>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Profile;
