import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useMembershipCheckout } from "../hooks/useMembershipCheckout";
import type { MembershipType } from "../utils/membership";
import { cn } from "../utils/cn";
import { rememberMembershipCheckoutPlan } from "../utils/membership";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Membership() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { mutateAsync, isPending } = useMembershipCheckout();

  const [email, setEmail] = useState(user?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const accountEmail = user?.email ?? "";
  const hasAccount = Boolean(user);

  const [searchParams] = useSearchParams();
  const discountCode = useMemo(() => {
    const code = searchParams.get("discount");
    if (!code) {
      return undefined;
    }
    const trimmed = code.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, [searchParams]);

  useEffect(() => {
    if (accountEmail) {
      setEmail(accountEmail);
    } else if (!hasAccount) {
      setEmail("");
    }
  }, [accountEmail, hasAccount]);

  const [pendingTier, setPendingTier] = useState<MembershipType | null>(null);

  const handleCheckout = async (tier: MembershipType) => {
    setTouched(true);

    const normalizedEmail = email.trim();
    if (!emailRegex.test(normalizedEmail)) {
      setError(t("membership.errors.invalidEmail"));
      return;
    }

    try {
      setError(null);
      setPendingTier(tier);
      setSuccessMessage(null);
      const session = await mutateAsync({
        email: normalizedEmail,
        membershipType: tier,
        discountCode,
      });
      if (session.invoiceUrl) {
        rememberMembershipCheckoutPlan(tier);
        window.location.href = session.invoiceUrl;
      } else if (session.message) {
        setSuccessMessage(session.message);
      } else {
        throw new Error(t("membership.errors.missingRedirect"));
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("membership.errors.generic");
      setError(message);
      setSuccessMessage(null);
    } finally {
      setPendingTier(null);
    }
  };

  const isEmailValid = emailRegex.test(email.trim());
  const showValidationState = touched && !isEmailValid;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-12 sm:px-6">
      <header className="space-y-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">
          {t("membership.badge")}
        </p>
        <h1 className="text-3xl font-black uppercase tracking-[0.16em] text-[var(--fg-default)] sm:text-4xl">
          {t("membership.title")}
        </h1>
        <p className="text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
          {t("membership.description")}
        </p>
      </header>

      <div className="mx-auto mt-10 max-w-2xl space-y-8 rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-8 shadow-[var(--shadow-soft)]">
        <ul className="space-y-4 text-left text-sm font-medium text-[var(--fg-muted)]">
          <li className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              01
            </span>
            <span>{t("membership.benefits.one")}</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              02
            </span>
            <span>{t("membership.benefits.two")}</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              03
            </span>
            <span>{t("membership.benefits.three")}</span>
          </li>
        </ul>

        <form
          onSubmit={(event) => event.preventDefault()}
          className="space-y-5"
        >
          <div className="space-y-2">
            <label
              htmlFor="membership-email"
              className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]"
            >
              {t("membership.form.emailLabel")}
            </label>
            <input
              id="membership-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) {
                  setError(null);
                }
                if (successMessage) {
                  setSuccessMessage(null);
                }
              }}
              onBlur={() => setTouched(true)}
              placeholder={t("membership.form.emailPlaceholder")}
              className={cn(
                "w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60",
                (showValidationState || (!!error && !isPending)) && "border-red-400 focus:border-red-500 focus:ring-red-200",
              )}
              autoComplete="email"
            />
            {user?.email && (
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
                {t("membership.form.usingAccount")}
              </p>
            )}
            {showValidationState && (
              <p className="text-xs font-semibold text-red-500">
                {t("membership.errors.invalidEmail")}
              </p>
            )}
            {error && !showValidationState && (
              <p className="text-xs font-semibold text-red-500">{error}</p>
            )}
            {successMessage && (
              <p className="text-xs font-semibold text-green-500">
                {successMessage}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleCheckout("annual")}
              disabled={!isEmailValid || isPending}
              className="rounded-full bg-gradient-to-r from-brand via-brand/90 to-[#FFF582] px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_20px_45px_rgba(169,21,255,0.35)] transition hover:-translate-y-1 hover:shadow-[0_30px_60px_rgba(169,21,255,0.45)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPending && pendingTier === "annual"
                ? t("membership.form.pending")
                : t("membership.form.annual")}
            </button>
            <button
              type="button"
              onClick={() => handleCheckout("lifetime")}
              disabled={!isEmailValid || isPending}
              className="rounded-full bg-gradient-to-r from-brand via-brand/90 to-[#FFF582] px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_20px_45px_rgba(169,21,255,0.35)] transition hover:-translate-y-1 hover:shadow-[0_30px_60px_rgba(169,21,255,0.45)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPending && pendingTier === "lifetime"
                ? t("membership.form.pending")
                : t("membership.form.lifetime")}
            </button>
          </div>
        </form>

        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
          {t("membership.nowpaymentsNote")}
        </p>
      </div>
    </div>
  );
}
