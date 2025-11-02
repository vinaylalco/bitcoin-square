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

const TEN_SECONDS_MS = 10_000;
const THIRTY_SECONDS_MS = 30_000;

export default function MembershipSuccess() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [expectedPlan, setExpectedPlan] = useState<MembershipType | null>(() => {
    const snapshot = readMembershipCheckoutPlan();
    return snapshot?.plan ?? null;
  });

  const [timedOut, setTimedOut] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (token) {
      startTimeRef.current = Date.now();
      setTimedOut(false);
    }
  }, [token]);

  const { me, loading, error, refetch } = useCurrentUserMembership({
    enabled: Boolean(token),
    refetchInterval: (queryData) => {
      if (!queryData || timedOut) {
        return timedOut ? false : TEN_SECONDS_MS;
      }

      const membership = normalizeMembershipStatus(
        (queryData as Record<string, unknown>)["membership"],
      );

      const matchesPlan =
        !expectedPlan || membership.type === expectedPlan;
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
  const showSigninNotice = !token;

  useEffect(() => {
    if (showSigninNotice) {
      setTimedOut(false);
    }
  }, [showSigninNotice]);

  useEffect(() => {
    if (isVerifiedActive && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      clearMembershipCheckoutPlan();
      setExpectedPlan(null);
      navigate("/community", { replace: true });
    }
  }, [isVerifiedActive, navigate]);

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
    } else if (token) {
      errorMessage = t("membership.success.errors.generic");
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
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
        {!isVerifiedActive && !showSigninNotice && !timedOut && (
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
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to="/community"
            className="inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-white shadow-[0_12px_30px_rgba(169,21,255,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(169,21,255,0.45)]"
          >
            {t("membership.success.communityCta")}
          </Link>
          <Link
            to="/education"
            className="inline-flex items-center justify-center rounded-full bg-[var(--bg-elevated)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-default)] shadow-[0_12px_30px_rgba(0,0,0,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.18)]"
          >
            {t("membership.success.educationCta")}
          </Link>
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
