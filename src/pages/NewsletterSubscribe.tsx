import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  useNewsletter,
  useSubscribe,
  useUnsubscribe,
} from "../hooks/useNewsletter";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NewsletterSubscribe() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [errorKey, setErrorKey] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; messageKey: string } | null>(
    null,
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [bannerMessage, setBannerMessage] = useState(() => searchParams.get("msg") ?? "");
  useNewsletter();
  const subscribe = useSubscribe();
  const unsubscribe = useUnsubscribe();

  useEffect(() => {
    setBannerMessage(searchParams.get("msg") ?? "");
  }, [searchParams]);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailRegex.test(email)) {
      setErrorKey("newsletter.form.invalidEmail");
      setStatus(null);
      return;
    }
    setErrorKey("");
    subscribe.mutate(email, {
      onSuccess: () =>
        setStatus({ type: "success", messageKey: "newsletter.status.subscribeSuccess" }),
      onError: () =>
        setStatus({ type: "error", messageKey: "newsletter.status.subscribeError" }),
    });
  };

  const handleUnsubscribe = () => {
    if (!emailRegex.test(email)) {
      setErrorKey("newsletter.form.invalidEmail");
      setStatus(null);
      return;
    }
    setErrorKey("");
    unsubscribe.mutate(email, {
      onSuccess: () =>
        setStatus({ type: "success", messageKey: "newsletter.status.unsubscribeSuccess" }),
      onError: () =>
        setStatus({ type: "error", messageKey: "newsletter.status.unsubscribeError" }),
    });
  };

  const dismissBanner = () => {
    setBannerMessage("");
    if (searchParams.get("msg")) {
      const next = new URLSearchParams(searchParams);
      next.delete("msg");
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-12 text-center sm:px-6">
      {bannerMessage && (
        <div className="mb-6 rounded-3xl border border-brand/30 bg-brand/5 px-6 py-4 text-left text-sm text-[var(--fg-default)] shadow-[0_12px_30px_rgba(169,21,255,0.18)]">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-semibold text-brand">{bannerMessage}</p>
            <button
              type="button"
              onClick={dismissBanner}
              className="inline-flex items-center rounded-full border border-brand/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:bg-brand hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
      <header className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">{t("newsletter.label")}</p>
        <h1 className="text-3xl font-black uppercase tracking-[0.16em] text-[var(--fg-default)] sm:text-4xl">
          {t("newsletter.title")}
        </h1>
        <p className="text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
          {t("newsletter.description")}
        </p>
      </header>

      <div className="mx-auto mt-10 max-w-xl rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-8 shadow-[var(--shadow-soft)]">
        <form onSubmit={handleSubscribe} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
              {t("newsletter.form.emailLabel")}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("newsletter.form.emailPlaceholder")}
              className="w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60"
            />
            {errorKey && <p className="text-xs text-brand">{t(errorKey)}</p>}
          </div>
          <button
            type="submit"
            className="w-full rounded-full bg-gradient-to-r from-brand via-brand/90 to-[#FFF582] px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_20px_45px_rgba(169,21,255,0.35)] transition hover:-translate-y-1 hover:shadow-[0_30px_60px_rgba(169,21,255,0.45)]"
          >
            {t("newsletter.form.subscribe")}
          </button>
        </form>
        <button
          onClick={handleUnsubscribe}
          className="mt-4 w-full rounded-full border border-brand/30 px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-brand transition hover:border-brand hover:bg-brand hover:text-white"
        >
          {t("newsletter.form.unsubscribe")}
        </button>
        {status && (
          <p
            className={`mt-4 text-xs font-semibold uppercase tracking-[0.32em] ${
              status.type === "success" ? "text-brand" : "text-red-500"
            }`}
          >
            {t(status.messageKey)}
          </p>
        )}
      </div>
    </div>
  );
}
