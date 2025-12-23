import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useMembershipCheckout } from "../hooks/useMembershipCheckout";
import type { MembershipType } from "../utils/membership";
import { rememberMembershipCheckoutPlan } from "../utils/membership";
import {
  rememberPendingMembershipAuth,
  clearPendingMembershipAuth,
} from "../utils/pendingMembershipAuth";
import { cn } from "../utils/cn";
import { StrapiNetworkError } from "../api/strapi-client";
import { createReferral } from "../api/referrals";
import { resolveStrapiAuthError } from "../utils/strapiErrors";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

const formatDiscountTxHash = (discountCode: string | undefined, email: string) => {
  const sanitizeSegment = (value: string): string =>
    value
      .trim()
      .replace(/[^a-z0-9]/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "")
      .toUpperCase();

  const codeSegment = sanitizeSegment(discountCode ?? "") || "FREE";
  const emailHandle = email.split("@")[0] ?? email;
  const emailSegment = sanitizeSegment(emailHandle) || "USER";

  return `DISCOUNT-${codeSegment}-${emailSegment}`;
};

type PortalView = "login" | "signup";

export default function Membership() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, register, user, completeAuthFromResponse } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const { mutateAsync: startCheckout } = useMembershipCheckout();

  const discountCode = useMemo(() => {
    const code = searchParams.get("discount");
    if (!code) {
      return undefined;
    }
    const trimmed = code.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, [searchParams]);

  const viewParam = searchParams.get("view");
  const [activeView, setActiveView] = useState<PortalView>(
    viewParam === "signup" ? "signup" : "login",
  );

  useEffect(() => {
    const nextView = viewParam === "signup" ? "signup" : "login";
    setActiveView((prev) => (prev === nextView ? prev : nextView));
  }, [viewParam]);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginAttempted, setLoginAttempted] = useState(false);

  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPlan, setSignupPlan] = useState<MembershipType>("annual");
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupInfo, setSignupInfo] = useState<string | null>(null);
  const [signupSubmitting, setSignupSubmitting] = useState(false);
  const [signupAttempted, setSignupAttempted] = useState(false);

  useEffect(() => {
    if (user?.email && !loginEmail) {
      setLoginEmail(user.email);
    }
  }, [loginEmail, user?.email]);

  useEffect(() => {
    setLoginAttempted(false);
    setLoginError(null);
    setSignupAttempted(false);
    setSignupError(null);
    setSignupInfo(null);
  }, [activeView]);

  const isLoginEmailValid = emailRegex.test(loginEmail.trim());
  const isLoginPasswordValid = loginPassword.trim().length > 0;
  const showLoginEmailError = loginAttempted && !isLoginEmailValid;
  const showLoginPasswordError = loginAttempted && !isLoginPasswordValid;

  const isSignupEmailValid = emailRegex.test(signupEmail.trim());
  const isSignupPasswordValid = signupPassword.trim().length >= MIN_PASSWORD_LENGTH;
  const showSignupEmailError = signupAttempted && !isSignupEmailValid;
  const showSignupPasswordError = signupAttempted && !isSignupPasswordValid;

  const handleViewChange = (view: PortalView) => {
    setActiveView(view);
    const nextParams = new URLSearchParams(searchParams);
    if (view === "signup") {
      nextParams.set("view", "signup");
    } else {
      nextParams.delete("view");
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginAttempted(true);
    setLoginError(null);

    const trimmedEmail = loginEmail.trim();
    const trimmedPassword = loginPassword.trim();

    if (!emailRegex.test(trimmedEmail)) {
      setLoginError(t("membership.errors.invalidEmail"));
      return;
    }
    if (!trimmedPassword) {
      setLoginError(t("membership.portal.errors.loginGeneric"));
      return;
    }

    setLoginSubmitting(true);
    try {
      await login(trimmedEmail, trimmedPassword);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      if (error instanceof StrapiNetworkError) {
        setLoginError(t("membership.portal.errors.network"));
      } else {
        const resolved = resolveStrapiAuthError(error);
        switch (resolved.code) {
          case "invalid_credentials":
            setLoginError(t("membership.portal.errors.loginInvalid"));
            break;
          case "email_taken":
            setLoginError(t("membership.portal.errors.emailTaken"));
            break;
          case "discount_expired":
            setLoginError(t("membership.portal.errors.discountExpired"));
            break;
          case "invalid_code":
            setLoginError(t("membership.portal.errors.invalidCode"));
            break;
          default:
            setLoginError(resolved.message || t("membership.portal.errors.loginGeneric"));
        }
      }
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleSignupSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignupAttempted(true);
    setSignupError(null);
    setSignupInfo(null);

    const trimmedEmail = signupEmail.trim();

    if (!emailRegex.test(trimmedEmail)) {
      setSignupError(t("membership.errors.invalidEmail"));
      return;
    }

    if (signupPassword.trim().length < MIN_PASSWORD_LENGTH) {
      setSignupError(
        t("membership.portal.errors.passwordLength", { count: MIN_PASSWORD_LENGTH }),
      );
      return;
    }

    setSignupSubmitting(true);
    let pendingStored = false;
    try {
      const discountTxHash = discountCode
        ? formatDiscountTxHash(discountCode, trimmedEmail)
        : undefined;

      const authResponse = await register(trimmedEmail, signupPassword);

      const ref = localStorage.getItem('tsq_ref');
      if (ref) {
        try {
          await createReferral({
            referrerId: ref,
            referredUserId: authResponse.user.id,
          });
        } catch (error) {
          console.warn('Failed to record referral', error);
        }
      }
      const checkout = await startCheckout({
        email: trimmedEmail,
        membershipType: signupPlan,
        discountCode,
        userId: authResponse.user.id,
        txHash: discountTxHash,
      });

      if (checkout.invoiceUrl) {
        rememberPendingMembershipAuth(authResponse);
        pendingStored = true;
        rememberMembershipCheckoutPlan(signupPlan);
        setSignupInfo(t("membership.portal.successMessage"));
        window.location.href = checkout.invoiceUrl;
        return;
      }

      if (checkout.message) {
        try {
          await completeAuthFromResponse(authResponse);
        } catch (authError) {
          console.warn("Failed to finalize membership authentication", authError);
          setSignupError(t("membership.portal.errors.signupGeneric"));
          return;
        }
        clearPendingMembershipAuth();
        navigate("/dashboard", { replace: true });
        return;
      }

      throw new Error(t("membership.errors.missingRedirect"));
    } catch (error) {
      if (!pendingStored) {
        clearPendingMembershipAuth();
      }
      if (error instanceof StrapiNetworkError) {
        setSignupError(t("membership.portal.errors.network"));
      } else {
        const resolved = resolveStrapiAuthError(error);
        switch (resolved.code) {
          case "email_taken":
            setSignupError(t("membership.portal.errors.emailTaken"));
            break;
          case "discount_expired":
            setSignupError(t("membership.portal.errors.discountExpired"));
            break;
          case "invalid_credentials":
            setSignupError(t("membership.portal.errors.loginInvalid"));
            break;
          case "invalid_code":
            setSignupError(t("membership.portal.errors.invalidCode"));
            break;
          default:
            setSignupError(resolved.message || t("membership.portal.errors.signupGeneric"));
        }
      }
    } finally {
      setSignupSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-12 sm:px-6">
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

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="space-y-6 rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <div className="flex items-center justify-center rounded-full border border-brand/20 bg-brand/10 p-1 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
            <button
              type="button"
              onClick={() => handleViewChange("login")}
              className={cn(
                "flex-1 rounded-full px-4 py-2 transition",
                activeView === "login"
                  ? "bg-brand text-white shadow-[0_12px_30px_rgba(169,21,255,0.35)]"
                  : "text-brand/70 hover:text-brand",
              )}
            >
              {t("membership.portal.tabs.login")}
            </button>
            <button
              type="button"
              onClick={() => handleViewChange("signup")}
              className={cn(
                "flex-1 rounded-full px-4 py-2 transition",
                activeView === "signup"
                  ? "bg-brand text-white shadow-[0_12px_30px_rgba(169,21,255,0.35)]"
                  : "text-brand/70 hover:text-brand",
              )}
            >
              {t("membership.portal.tabs.signup")}
            </button>
          </div>

          {activeView === "login" ? (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h2 className="text-lg font-semibold uppercase tracking-[0.24em] text-[var(--fg-default)]">
                  {t("membership.portal.login.title")}
                </h2>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--fg-muted)]">
                  {t("membership.portal.login.subtitle")}
                </p>
              </div>

              {user && (
                <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4 text-center text-xs font-semibold uppercase tracking-[0.28em] text-brand">
                  {t("membership.portal.alreadySignedIn")}
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-5">
                <div className="space-y-2 text-left">
                  <label
                    htmlFor="membership-login-email"
                    className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]"
                  >
                    {t("membership.portal.inputs.email")}
                  </label>
                  <input
                    id="membership-login-email"
                    type="email"
                    value={loginEmail}
                    onChange={(event) => {
                      setLoginEmail(event.target.value);
                      if (loginError) {
                        setLoginError(null);
                      }
                    }}
                    autoComplete="email"
                    className={cn(
                      "w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60",
                      showLoginEmailError && "border-red-400 focus:border-red-500 focus:ring-red-200",
                    )}
                  />
                  {showLoginEmailError && (
                    <p className="text-xs font-semibold text-red-500">
                      {t("membership.errors.invalidEmail")}
                    </p>
                  )}
                </div>

                <div className="space-y-2 text-left">
                  <label
                    htmlFor="membership-login-password"
                    className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]"
                  >
                    {t("membership.portal.inputs.password")}
                  </label>
                  <input
                    id="membership-login-password"
                    type="password"
                    value={loginPassword}
                    onChange={(event) => {
                      setLoginPassword(event.target.value);
                      if (loginError) {
                        setLoginError(null);
                      }
                    }}
                    autoComplete="current-password"
                    className={cn(
                      "w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60",
                      showLoginPasswordError && "border-red-400 focus:border-red-500 focus:ring-red-200",
                    )}
                  />
                  {showLoginPasswordError && (
                    <p className="text-xs font-semibold text-red-500">
                      {t("membership.portal.errors.loginGeneric")}
                    </p>
                  )}
                </div>

                {loginError && (
                  <p className="text-xs font-semibold text-red-500">{loginError}</p>
                )}

                <button
                  type="submit"
                  disabled={loginSubmitting}
                  className="w-full rounded-full bg-gradient-to-r from-brand via-brand/90 to-[#FFF582] px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_20px_45px_rgba(169,21,255,0.35)] transition hover:-translate-y-1 hover:shadow-[0_30px_60px_rgba(169,21,255,0.45)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loginSubmitting
                    ? t("membership.portal.login.pending")
                    : t("membership.portal.login.submit")}
                </button>

                <div className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-[var(--fg-muted)]">
                  <Link to="/forgot-password" className="text-brand hover:underline">
                    {t("auth.login.forgotPasswordLink")}
                  </Link>
                </div>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h2 className="text-lg font-semibold uppercase tracking-[0.24em] text-[var(--fg-default)]">
                  {t("membership.portal.signup.title")}
                </h2>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--fg-muted)]">
                  {t("membership.portal.signup.subtitle")}
                </p>
              </div>

              <form onSubmit={handleSignupSubmit} className="space-y-5">
                <div className="space-y-2 text-left">
                  <label
                    htmlFor="membership-signup-email"
                    className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]"
                  >
                    {t("membership.portal.inputs.email")}
                  </label>
                  <input
                    id="membership-signup-email"
                    type="email"
                    value={signupEmail}
                    onChange={(event) => {
                      setSignupEmail(event.target.value);
                      if (signupError) {
                        setSignupError(null);
                      }
                    }}
                    autoComplete="email"
                    className={cn(
                      "w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60",
                      showSignupEmailError && "border-red-400 focus:border-red-500 focus:ring-red-200",
                    )}
                  />
                  {showSignupEmailError && (
                    <p className="text-xs font-semibold text-red-500">
                      {t("membership.errors.invalidEmail")}
                    </p>
                  )}
                </div>

                <div className="space-y-2 text-left">
                  <label
                    htmlFor="membership-signup-password"
                    className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]"
                  >
                    {t("membership.portal.inputs.password")}
                  </label>
                  <input
                    id="membership-signup-password"
                    type="password"
                    value={signupPassword}
                    onChange={(event) => {
                      setSignupPassword(event.target.value);
                      if (signupError) {
                        setSignupError(null);
                      }
                    }}
                    autoComplete="new-password"
                    className={cn(
                      "w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60",
                      showSignupPasswordError && "border-red-400 focus:border-red-500 focus:ring-red-200",
                    )}
                  />
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
                    {t("membership.portal.passwordHint", { count: MIN_PASSWORD_LENGTH })}
                  </p>
                  {showSignupPasswordError && (
                    <p className="text-xs font-semibold text-red-500">
                      {t("membership.portal.errors.passwordLength", { count: MIN_PASSWORD_LENGTH })}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
                    {t("membership.portal.signup.planLabel")}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["annual", "lifetime"] as MembershipType[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setSignupPlan(option)}
                        className={cn(
                          "rounded-3xl border border-brand/20 px-5 py-4 text-left transition hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_16px_40px_rgba(169,21,255,0.35)]",
                          signupPlan === option
                            ? "bg-gradient-to-r from-brand via-brand/90 to-[#FFF582] text-white shadow-[0_20px_45px_rgba(169,21,255,0.45)]"
                            : "bg-transparent text-[var(--fg-default)]",
                        )}
                      >
                        <span className="block text-xs font-semibold uppercase tracking-[0.32em]">
                          {t(`membership.portal.planLabels.${option}`)}
                        </span>
                        <span className="mt-2 block text-sm font-medium tracking-[0.12em] text-[var(--fg-muted)]">
                          {t(`membership.form.${option}`)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {signupError && (
                  <p className="text-xs font-semibold text-red-500">{signupError}</p>
                )}
                {signupInfo && (
                  <p className="text-xs font-semibold text-brand">{signupInfo}</p>
                )}

                <button
                  type="submit"
                  disabled={signupSubmitting}
                  className="w-full rounded-full bg-gradient-to-r from-brand via-brand/90 to-[#FFF582] px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_20px_45px_rgba(169,21,255,0.35)] transition hover:-translate-y-1 hover:shadow-[0_30px_60px_rgba(169,21,255,0.45)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {signupSubmitting
                    ? t("membership.portal.signup.pending")
                    : t("membership.portal.signup.submit")}
                </button>

                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
                  {t("membership.nowpaymentsNote")}
                </p>
              </form>
            </div>
          )}
        </section>

        <aside className="space-y-5 rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <h2 className="text-lg font-semibold uppercase tracking-[0.24em] text-[var(--fg-default)]">
            {t("membership.portal.benefitsTitle")}
          </h2>
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
        </aside>
      </div>
    </div>
  );
}
