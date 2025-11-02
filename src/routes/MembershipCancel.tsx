import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { clearMembershipCheckoutPlan } from "../utils/membership";

export default function MembershipCancel() {
  const { t } = useTranslation();

  useEffect(() => {
    clearMembershipCheckoutPlan();
  }, []);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">
          {t("membership.cancel.badge")}
        </p>
        <h1 className="text-3xl font-black uppercase tracking-[0.12em] text-[var(--fg-default)] sm:text-4xl">
          {t("membership.cancel.title")}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
          {t("membership.cancel.description")}
        </p>
      </div>
      <Link
        to="/membership"
        className="inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-white shadow-[0_12px_30px_rgba(169,21,255,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(169,21,255,0.45)]"
      >
        {t("membership.cancel.retry")}
      </Link>
    </div>
  );
}
