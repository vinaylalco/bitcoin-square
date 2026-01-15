import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LoadingSpinner from "../components/LoadingSpinner";
import { useStrapiQuery } from "../hooks/useStrapiQuery";

type CtaCard = {
  title: string;
  description: string;
  cta: string;
  subscribeMessage?: string;
  href?: string;
};

type HowItWorksItem = {
  step: string;
  title: string;
  description: string;
};

type Offering = {
  icon: string;
  title: string;
  description: string;
};

type RoadmapEntry = {
  phase: string;
  focus: string;
  description: string;
};

type PricingPlan = {
  name: string;
  price: string;
  highlight: string;
  suffix: string;
  features: string[];
  cta: string;
  accent?: boolean;
};

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand via-brand/85 to-[#FFF582] px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_20px_50px_rgba(169,21,255,0.35)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_70px_rgba(169,21,255,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export default function HomePage() {
  const { t } = useTranslation();
  const {
    data: memberCountData,
    isLoading: isMembersLoading,
    error: membersError,
    refetch: refetchMembers,
  } = useStrapiQuery<number>("members-count", "/api/users/count");
  const {
    data: lessonPlanCountData,
    isLoading: isLessonPlansLoading,
    error: lessonPlansError,
    refetch: refetchLessonPlans,
  } = useStrapiQuery<number>("lesson-plans-count", "/api/lessonplans/count");

  const normalizeArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? value : []);

  const howItWorks = useMemo(
    () =>
      normalizeArray<Partial<HowItWorksItem>>(
        t("home.sections.howItWorks.items", { returnObjects: true }),
      ).map((item) => ({
        step: item.step ?? "",
        title: item.title ?? "",
        description: item.description ?? "",
      })),
    [t],
  );

  const offerings = useMemo(
    () =>
      normalizeArray<Partial<Offering>>(
        t("home.sections.offerings.items", { returnObjects: true }),
      ).map((item) => ({
        icon: item.icon ?? "",
        title: item.title ?? "",
        description: item.description ?? "",
      })),
    [t],
  );

  const roadmap = useMemo(
    () =>
      normalizeArray<Partial<RoadmapEntry>>(
        t("home.sections.roadmap.items", { returnObjects: true }),
      ).map((item) => ({
        phase: item.phase ?? "",
        focus: item.focus ?? "",
        description: item.description ?? "",
      })),
    [t],
  );

  const pricing = useMemo(
    () =>
      normalizeArray<Partial<PricingPlan>>(
        t("home.sections.pricing.items", { returnObjects: true }),
      ).map((plan, index) => ({
        name: plan.name ?? `Plan ${index + 1}`,
        price: plan.price ?? "",
        highlight: plan.highlight ?? "",
        suffix: plan.suffix ?? "",
        features: Array.isArray(plan.features) ? plan.features : [],
        cta: plan.cta ?? "",
        accent: Boolean(plan.accent),
      })),
    [t],
  );

  const ctaCards = useMemo(
    () =>
      normalizeArray<Partial<CtaCard>>(t("home.sections.cta.cards", { returnObjects: true })).map(
        (card, index) => ({
          title: card.title ?? `CTA ${index + 1}`,
          description: card.description ?? "",
          cta: card.cta ?? "",
          subscribeMessage: card.subscribeMessage ?? "",
          href: card.href ?? undefined,
        }),
      ),
    [t],
  );

  if (isMembersLoading || isLessonPlansLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (membersError || lessonPlansError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <p className="text-brand">Unable to load stats right now.</p>
        <button
          type="button"
          onClick={() => {
            refetchMembers();
            refetchLessonPlans();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-full border border-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:bg-brand hover:text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  const memberCount =
    typeof memberCountData === "number" && Number.isFinite(memberCountData) ? memberCountData : 0;
  const lessonPlanCount =
    typeof lessonPlanCountData === "number" && Number.isFinite(lessonPlanCountData)
      ? lessonPlanCountData
      : 0;

  const heroStats = [
    {
      label: t("home.hero.stats.members"),
      value: memberCount.toLocaleString(),
    },
    {
      label: t("home.hero.stats.courses"),
      value: lessonPlanCount.toLocaleString(),
    },
  ];

  return (
    <div className="relative min-h-screen space-y-20 overflow-hidden bg-gradient-to-b from-white via-neutral-50 to-neutral-100 px-4 pb-20 pt-10 text-neutral-900 transition-colors duration-500 dark:from-neutral-950 dark:via-neutral-950 dark:to-black dark:text-neutral-100 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl rounded-3xl border border-neutral-200/70 bg-white/80 px-6 py-12 text-center shadow-[0_30px_120px_rgba(15,23,42,0.12)] backdrop-blur-sm transition-colors duration-500 dark:border-neutral-800/60 dark:bg-neutral-900/70 dark:shadow-[0_35px_120px_rgba(0,0,0,0.55)] md:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">{t("home.hero.eyebrow")}</p>
        <h1 className="mt-6 text-4xl font-black tracking-tight text-neutral-900 transition-colors duration-300 dark:text-white sm:text-5xl lg:text-6xl">
          {t("home.hero.title")} <span className="text-brand">{t("home.hero.highlight")}</span>
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-neutral-600 transition-colors duration-300 dark:text-neutral-300 sm:text-xl">
          {t("home.hero.description")}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a href="/community" className={buttonBase}>
            {t("home.hero.primaryCta")}
            <span aria-hidden="true" className="text-lg">
              →
            </span>
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-neutral-200/70 bg-white/70 px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-neutral-900 shadow-[0_14px_45px_rgba(15,23,42,0.1)] transition duration-300 hover:-translate-y-0.5 hover:border-brand/70 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-100 dark:hover:text-brand"
          >
            {t("home.hero.secondaryCta")}
          </a>
        </div>
        <dl className="mt-10 grid grid-cols-1 gap-6 text-center sm:grid-cols-2">
          {heroStats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-3xl border border-neutral-200/80 bg-white/80 px-6 py-6 shadow-inner transition-colors duration-300 dark:border-neutral-800/80 dark:bg-neutral-900/60"
            >
              <dt className="text-sm uppercase tracking-[0.35em] text-neutral-500 dark:text-neutral-400">{stat.label}</dt>
              <dd className="mt-2 text-3xl font-semibold text-neutral-900 transition-colors duration-300 dark:text-white">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl space-y-10 scroll-mt-28">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">
            {t("home.sections.howItWorks.eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-neutral-900 transition-colors duration-300 dark:text-white sm:text-4xl">
            {t("home.sections.howItWorks.title")}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {howItWorks.map((item) => (
            <article
              key={item.title}
              className="group flex h-full flex-col gap-4 rounded-3xl border border-neutral-200/70 bg-white/80 p-6 text-center shadow-[0_18px_70px_rgba(15,23,42,0.12)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_25px_110px_rgba(169,21,255,0.28)] dark:border-neutral-800/70 dark:bg-neutral-900/70"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-brand via-brand/80 to-[#FFF582] text-xl shadow-[0_10px_30px_rgba(169,21,255,0.35)]">
                {item.step}
              </div>
              <h3 className="text-xl font-semibold text-neutral-900 transition-colors duration-300 dark:text-white">
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed text-neutral-600 transition-colors duration-300 dark:text-neutral-300">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-10">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">
            {t("home.sections.offerings.eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-neutral-900 transition-colors duration-300 dark:text-white sm:text-4xl">
            {t("home.sections.offerings.title")}
          </h2>
          <p className="mt-4 text-base text-neutral-600 transition-colors duration-300 dark:text-neutral-300 sm:text-lg">
            {t("home.sections.offerings.description")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {offerings.map((offering) => (
            <article
              key={offering.title}
              className="group flex h-full flex-col gap-5 rounded-3xl border border-neutral-200/70 bg-white/80 p-8 shadow-[0_25px_90px_rgba(15,23,42,0.12)] transition duration-500 hover:-translate-y-1 hover:border-brand/60 hover:shadow-[0_30px_110px_rgba(169,21,255,0.28)] dark:border-neutral-800/70 dark:bg-neutral-900/70"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-2xl transition-colors duration-300 dark:bg-neutral-800">
                {offering.icon}
              </div>
              <div className="space-y-3 text-left">
                <h3 className="text-2xl font-semibold text-neutral-900 transition-colors duration-300 dark:text-white">
                  {offering.title}
                </h3>
                <p className="text-sm leading-relaxed text-neutral-600 transition-colors duration-300 dark:text-neutral-300">
                  {offering.description}
                </p>
              </div>
            </article>
          ))}
        </div>
        <div className="rounded-3xl border border-neutral-200/70 bg-white/80 p-6 text-left shadow-[0_25px_90px_rgba(15,23,42,0.12)] transition-colors duration-300 dark:border-neutral-800/70 dark:bg-neutral-900/70">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">
            {t("home.sections.offerings.dcaToolsTitle")}
          </p>
          <p className="mt-2 text-sm text-neutral-600 transition-colors duration-300 dark:text-neutral-300">
            {t("home.sections.offerings.dcaToolsDescription")}
          </p>
          <Link
            to="/tools/btc-buying-strategies"
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand px-5 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:bg-brand/10"
          >
            {t("home.sections.offerings.dcaToolsCta")} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-10">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">
            {t("home.sections.roadmap.eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-neutral-900 transition-colors duration-300 dark:text-white sm:text-4xl">
            {t("home.sections.roadmap.title")}
          </h2>
        </div>
        <div className="relative grid gap-6 rounded-3xl border border-neutral-200/70 bg-white/80 p-8 shadow-[0_25px_90px_rgba(15,23,42,0.12)] transition-colors duration-300 dark:border-neutral-800/70 dark:bg-neutral-900/70 md:grid-cols-3">
          {roadmap.map((entry, index) => (
            <Fragment key={entry.phase}>
              <article className="flex h-full flex-col gap-4 rounded-2xl border border-neutral-200/70 bg-white/70 p-6 text-left transition-colors duration-300 dark:border-neutral-800/70 dark:bg-neutral-900/60">
                <h3 className="text-xl font-semibold text-neutral-900 transition-colors duration-300 dark:text-white">
                  {entry.phase}
                </h3>
                <p className="text-sm font-semibold uppercase tracking-[0.32em] text-brand/80">{entry.focus}</p>
                <p className="text-sm leading-relaxed text-neutral-600 transition-colors duration-300 dark:text-neutral-300">
                  {entry.description}
                </p>
              </article>
              {index < roadmap.length - 1 && (
                <div className="hidden h-full items-center justify-center md:flex">
                  <div className="h-16 w-px bg-gradient-to-b from-brand/60 via-brand/20 to-transparent" />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-10">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">
            {t("home.sections.pricing.eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-neutral-900 transition-colors duration-300 dark:text-white sm:text-4xl">
            {t("home.sections.pricing.title")}
          </h2>
          <p className="mt-4 text-base text-neutral-600 transition-colors duration-300 dark:text-neutral-300 sm:text-lg">
            {t("home.sections.pricing.description")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {pricing.map((plan) => (
            <article
              key={plan.name}
              className={`relative flex h-full flex-col gap-5 rounded-3xl border p-8 shadow-[0_25px_90px_rgba(15,23,42,0.12)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_30px_110px_rgba(169,21,255,0.28)] dark:border-neutral-800/70 dark:bg-neutral-900/70 ${
                plan.accent
                  ? "border-brand/60 bg-white/90 dark:bg-neutral-900/80"
                  : "border-neutral-200/70 bg-white/80"
              }`}
            >
              {plan.accent && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand via-brand/80 to-[#FFF582] px-3 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-white shadow-[0_12px_40px_rgba(169,21,255,0.35)]">
                  {t("home.sections.pricing.recommended")}
                </span>
              )}
              <header className="mt-2 text-center">
                <h3 className="text-2xl font-semibold text-neutral-900 transition-colors duration-300 dark:text-white">
                  {plan.name}
                </h3>
                <div className="mt-3 flex items-baseline justify-center gap-2 text-4xl font-black text-neutral-900 transition-colors duration-300 dark:text-white">
                  {plan.price}
                  <span className="text-base font-semibold text-brand/80">{plan.suffix}</span>
                </div>
                <p className="mt-2 text-sm text-neutral-500 transition-colors duration-300 dark:text-neutral-400">{plan.highlight}</p>
              </header>
              <ul className="space-y-3 text-sm text-neutral-600 transition-colors duration-300 dark:text-neutral-300">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-gradient-to-r from-brand via-brand/80 to-[#FFF582]" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <a href="/membership" className={buttonBase}>
                {plan.cta}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-10">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">
            {t("home.sections.cta.eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-neutral-900 transition-colors duration-300 dark:text-white sm:text-4xl">
            {t("home.sections.cta.title")}
          </h2>
          <p className="mt-4 text-base text-neutral-600 transition-colors duration-300 dark:text-neutral-300 sm:text-lg">
            {t("home.sections.cta.description")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {ctaCards.map((card) => {
            const href =
              card.href ??
              (card.subscribeMessage
                ? `/subscribe?msg=${encodeURIComponent(card.subscribeMessage)}`
                : undefined);

            return (
            <article
              key={card.title}
              className="flex h-full flex-col gap-4 rounded-3xl border border-neutral-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_30px_110px_rgba(169,21,255,0.28)] dark:border-neutral-800/70 dark:bg-neutral-900/70"
            >
              <h3 className="text-xl font-semibold text-neutral-900 transition-colors duration-300 dark:text-white">
                {card.title}
              </h3>
              <p className="flex-1 text-sm leading-relaxed text-neutral-600 transition-colors duration-300 dark:text-neutral-300">
                {card.description}
              </p>
              {href && (
                <a
                  href={href}
                  className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.32em] text-brand transition hover:text-brand/80"
                >
                  {card.cta}
                  <span aria-hidden="true" className="text-base">
                    →
                  </span>
                </a>
              )}
            </article>
          );
          })}
        </div>
      </section>

    </div>
  );
}
