import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { StrapiConfigError, StrapiNetworkError } from "../api/strapi-client";
import { normalizeMembershipStatus } from "../utils/membership";
import { useCurrentUserMembership } from "../hooks/useCurrentUserMembership";

const TEN_SECONDS_MS = 10_000;

export default function MembershipSuccess() {
  const { t } = useTranslation();
  const { token } = useAuth();

  const { me, loading, error } = useCurrentUserMembership({
    refetchInterval: (queryData) => {
      if (!queryData) {
        return TEN_SECONDS_MS;
      }
      const membership = normalizeMembershipStatus(
        (queryData as Record<string, unknown>)["membership"],
      );
      return membership.isActive ? false : TEN_SECONDS_MS;
    },
    refetchIntervalInBackground: true,
  });

  const membershipStatus = useMemo(() => {
    if (!me) {
      return normalizeMembershipStatus(null);
    }
    return normalizeMembershipStatus(me["membership"]);
  }, [me]);

  const isMembershipActive = membershipStatus.isActive;
  const showSigninNotice = !token;

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
        {!isMembershipActive && !showSigninNotice && (
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
        {isMembershipActive && (
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">
            {t("membership.success.active")}
          </p>
        )}
      </div>
      {isMembershipActive && (
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
      {!isMembershipActive && !showSigninNotice && (
        <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
          {t("membership.success.footer")}
        </p>
      )}
    </div>
  );
}
