import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../context/AuthContext";
import { StrapiConfigError, StrapiNetworkError } from "../api/strapi-client";
import {
  clearMembershipCheckoutPlan,
  normalizeMembershipStatus,
  readMembershipCheckoutPlan,
  type MembershipType,
} from "../utils/membership";
import { useCurrentUserMembership } from "../hooks/useCurrentUserMembership";
import {
  clearPendingMembershipAuth,
  readPendingMembershipAuth,
  type PendingMembershipAuthSnapshot,
} from "../utils/pendingMembershipAuth";
import type { AuthResponse } from "../api/auth";

const TEN_SECONDS_MS = 10_000;
const THIRTY_SECONDS_MS = 30_000;

export default function MembershipSuccess() {
  const { t } = useTranslation();
  const { token, completeAuthFromResponse } = useAuth();
  const navigate = useNavigate();

  // what we *expected* the user to buy (annual/lifetime)
  const [expectedPlan, setExpectedPlan] = useState<MembershipType | null>(() => {
    const snapshot = readMembershipCheckoutPlan();
    return snapshot?.plan ?? null;
  });

  // snapshot of auth returned from checkout (before we merged it)
  const [pendingAuth, setPendingAuth] = useState<PendingMembershipAuthSnapshot | null>(() =>
    readPendingMembershipAuth(),
  );

  // purely for UI: "this is taking longer than 30s"
  const [timedOut, setTimedOut] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const hasFinalizedRef = useRef(false);

  // we can authenticate either with the normal token or with the pending token
  const pendingToken = pendingAuth?.auth.jwt ?? null;
  const effectiveToken = token ?? pendingToken ?? null;

  // if the real token appears, drop the pending snapshot
  useEffect(() => {
    if (token && pendingAuth) {
      clearPendingMembershipAuth();
      setPendingAuth(null);
    }
  }, [pendingAuth, token]);

  // whenever we get a token (or switch tokens), reset the timeout window
  useEffect(() => {
    if (effectiveToken) {
      startTimeRef.current = Date.now();
      setTimedOut(false);
    }
  }, [effectiveToken]);

  // 🔴 Option A change: keep polling until we really see active membership.
  const { me, loading, error, refetch } = useCurrentUserMembership({
    enabled: Boolean(effectiveToken),
    tokenOverride: effectiveToken,
    refetchInterval: (queryData) => {
      // if we don't have data yet, keep polling
      if (!queryData) {
        return TEN_SECONDS_MS;
      }

      const membership = normalizeMembershipStatus(
        (queryData as Record<string, unknown>)["membership"],
      );

      const matchesPlan = !expectedPlan || membership.type === expectedPlan;
      const lifetimeHasNoExpiry =
        membership.type !== "lifetime" || membership.expiresAt === null;
      const annualHasFutureExpiry =
        membership.type !== "annual" ||
        (membership.expiresAt !== null &&
          membership.expiresAt.getTime() > Date.now());

      const isVerifiedActive =
        membership.isActive &&
        matchesPlan &&
        lifetimeHasNoExpiry &&
        annualHasFutureExpiry;

      // ✅ only stop when we are truly active
      return isVerifiedActive ? false : TEN_SECONDS_MS;
    },
    refetchIntervalInBackground: true,
  });

  const membershipStatus = useMemo(() => {
    if (!me) {
      return normalizeMembershipStatus(null);
    }
    return normalizeMembershipStatus(me["membership"]);
  }, [me]);

  const matchesPlan =
    !expectedPlan || membershipStatus.type === expectedPlan;
  const lifetimeHasNoExpiry =
    membershipStatus.type !== "lifetime" ||
    membershipStatus.expiresAt === null;
  const annualHasFutureExpiry =
    membershipStatus.type !== "annual" ||
    (membershipStatus.expiresAt !== null &&
      membershipStatus.expiresAt.getTime() > Date.now());

  const isVerifiedActive =
    membershipStatus.isActive &&
    matchesPlan &&
    lifetimeHasNoExpiry &&
    annualHasFutureExpiry;

  const showSigninNotice = !effectiveToken;

  // if user isn't signed in, don't show timeout
  useEffect(() => {
    if (showSigninNotice) {
      setTimedOut(false);
    }
  }, [showSigninNotice]);

  // when we finally see active membership, finalize auth + clear local markers
  useEffect(() => {
    if (!isVerifiedActive || hasFinalizedRef.current) {
      return;
    }

    const finalizeAndRedirect = async () => {
      if (!me) {
        return;
      }

      hasFinalizedRef.current = true;
      try {
        // if we got here using a pending token (post-checkout)
        if (!token) {
          if (!pendingAuth) {
            hasFinalizedRef.current = false;
            return;
          }

          const authResponse: AuthResponse = {
            jwt: pendingAuth.auth.jwt,
            user: me as AuthResponse["user"],
          };

          await completeAuthFromResponse(authResponse);
          clearPendingMembershipAuth();
          setPendingAuth(null);
        }

        clearMembershipCheckoutPlan();
        setExpectedPlan(null);
        navigate("/dashboard", { replace: true });
      } catch (authError) {
        console.warn("Failed to finalize membership authentication", authError);
        hasFinalizedRef.current = false;
      }
    };

    finalizeAndRedirect().catch((authError) => {
      console.warn("Failed to complete membership redirect", authError);
    });
  }, [
    completeAuthFromResponse,
    isVerifiedActive,
    me,
    pendingAuth,
    navigate,
    token,
  ]);

  // this effect is now *only* for showing "taking long", not for stopping network polls
  useEffect(() => {
    if (isVerifiedActive || showSigninNotice || timedOut) {
      return;
    }

    const elapsed = Date.now() - startTimeRef.current;
    const remaining = THIRTY_SECONDS_MS - elapsed;

    if (remaining <= 0) {
      setTimedOut(true);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTimedOut(true);
    }, remaining);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isVerifiedActive, showSigninNotice, timedOut]);

  const handleManualRefresh = useCallback(async () => {
    if (showSigninNotice) {
      return;
    }

    startTimeRef.current = Date.now();
    setTimedOut(false);
    try {
      await refetch();
    } catch (refreshError) {
      console.warn("Membership status refresh failed", refreshError);
    }
  }, [refetch, showSigninNotice]);

  let errorMessage: string | null = null;
  if (error) {
    if (error instanceof StrapiConfigError) {
      errorMessage = t("membership.success.errors.config");
    } else if (error instanceof StrapiNetworkError) {
      errorMessage = t("membership.success.errors.network");
    } else if (effectiveToken) {
      errorMessage = t("membership.success.errors.generic");
    }
  }

  const tourCards = useMemo(
    () => [
      {
        key: "dashboard" as const,
        to: "/dashboard",
        title: t("membership.success.tour.cards.dashboard.title"),
        description: t("membership.success.tour.cards.dashboard.description"),
      },
      {
        key: "education" as const,
        to: "/education",
        title: t("membership.success.tour.cards.education.title"),
        description: t("membership.success.tour.cards.education.description"),
      },
      {
        key: "community" as const,
        to: "/community",
        title: t("membership.success.tour.cards.community.title"),
        description: t("membership.success.tour.cards.community.description"),
      },
    ],
    [t],
  );

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-4xl flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">
          {t("membership.success.badge")}
        </p>
        <h1 className="text-3xl font-black uppercase tracking-[0.12em] text-[var(--fg-default)] sm:text-4xl">
          {t("membership.success.title")}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
          {t("membership.success.description")}
        </p>
        {!isVerifiedActive && !showSigninNotice && (
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--fg-muted)]">
            {t("membership.success.checking")}
            {loading && " •"}
          </p>
        )}
        {showSigninNotice && (
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--fg-muted)]">
            {t("membership.success.signinRequired")}
          </p>
        )}
        {errorMessage && (
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-500">
            {errorMessage}
          </p>
        )}
        {isVerifiedActive && (
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">
            {t("membership.success.active")}
          </p>
        )}
        {timedOut && !isVerifiedActive && !showSigninNotice && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--fg-muted)]">
              {t("membership.success.timeout")}
            </p>
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-full bg-[var(--bg-elevated)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-default)] shadow-[0_12px_30px_rgba(0,0,0,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("membership.success.refresh")}
            </button>
          </div>
        )}
      </div>
      {isVerifiedActive && (
        <div className="flex w-full flex-col items-center gap-6">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-semibold tracking-wide text-[var(--fg-default)] sm:text-3xl">
              {t("membership.success.tour.title")}
            </h2>
            <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
              {t("membership.success.tour.description")}
            </p>
          </div>
          <div className="grid w-full gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
            {tourCards.map((card) => (
              <Link
                key={card.key}
                to={card.to}
                className="group relative flex h-full flex-col rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 text-[var(--fg-default)] shadow-[0_12px_30px_rgba(0,0,0,0.12)] transition hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_16px_44px_rgba(169,21,255,0.28)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold uppercase tracking-[0.24em] text-brand/80">
                    {t("membership.success.tour.badge")}
                  </span>
                  <span
                    className="text-2xl transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-semibold text-[var(--fg-default)]">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">
                  {card.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
      {!isVerifiedActive && !showSigninNotice && (
        <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
          {t("membership.success.footer")}
        </p>
      )}
    </div>
  );
}
