import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";

export default function CheckoutCancel() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">
          {t("checkout.cancelled.badge")}
        </p>
        <h1 className="text-3xl font-black uppercase tracking-[0.12em] text-[var(--fg-default)] sm:text-4xl">
          {t("checkout.cancelled.title")}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
          {t("checkout.cancelled.description")}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          to="/education"
          className="inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-white shadow-[0_12px_30px_rgba(169,21,255,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(169,21,255,0.45)]"
        >
          {t("checkout.actions.browseCourses")}
        </Link>
        <Link
          to="/contact"
          className="inline-flex items-center justify-center rounded-full border border-brand px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:-translate-y-0.5 hover:bg-brand/10"
        >
          {t("checkout.actions.contactSupport")}
        </Link>
      </div>
      <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
        <Trans
          i18nKey="checkout.cancelled.support"
          values={{ email: "support@bitcoin-square.com" }}
          components={{
            link: (
              <a className="font-semibold text-brand" href="mailto:support@bitcoin-square.com" />
            ),
          }}
        />
      </p>
    </div>
  );
}
