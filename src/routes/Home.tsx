import { Link } from "react-router-dom";
import { ArrowRight, Play } from "lucide-react";
import { useStrapiQuery } from "../hooks/useStrapiQuery";
import type { Home } from "../types/strapi";
import HomeGhost from "../components/home/HomeGhost";

export default function HomePage() {
  const { data, isLoading, error } = useStrapiQuery<{ data: Home }>(
    "home",
    "/api/home-page?populate[HomePageSection][populate]=SectionImage",
  );

  if (isLoading) return <HomeGhost />;
  if (error || !data) return <p className="px-4 py-10 text-brand">Failed to load home.</p>;

  const home = data.data as unknown as Record<string, any>;
  const heroTitle = home.heroTitle || home.H1 || "Bitcoin Square";
  const heroSubtitle = home.heroSubtitle || home.MainSubHeading ||
    "Master Bitcoin through clear lessons, guided education, and tools built for real adoption.";
  const primaryCtaLabel = home.heroPrimaryCta?.label || home.HeroPrimaryButtonLabel || "Start Learning";
  const primaryCtaHref = home.heroPrimaryCta?.href || home.HeroPrimaryButtonUrl || "/education";
  const secondaryCtaLabel = home.heroSecondaryCta?.label || home.HeroSecondaryButtonLabel || "Visit the Shop";
  const secondaryCtaHref = home.heroSecondaryCta?.href || home.HeroSecondaryButtonUrl || "/shop";

  const sections =
    home.HomePageSection || home.sections || [];

  return (
    <div className="relative isolate overflow-hidden bg-[var(--bg-app)] text-[var(--fg-default)]">
      <div className="relative border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 left-20 h-80 w-80 rounded-full bg-gradient-to-br from-brand/60 via-brand/20 to-transparent blur-3xl" />
          <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-gradient-to-br from-black/80 via-brand/30 to-transparent blur-3xl opacity-80 dark:opacity-60" />
        </div>
        <div className="relative mx-auto flex max-w-6xl flex-col gap-16 px-4 pb-16 pt-12 sm:px-6 lg:flex-row lg:items-center lg:gap-20">
          <div className="relative flex-1 space-y-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/60 bg-brand/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.42em] text-brand shadow-[0_12px_45px_rgba(239,68,68,0.25)]">
              Modern Bitcoin Education
            </span>
            <div className="space-y-6">
              <h1 className="text-4xl font-black uppercase leading-[1.05] tracking-[0.08em] text-[var(--fg-default)] sm:text-5xl lg:text-6xl">
                {heroTitle}
              </h1>
              <p className="max-w-2xl text-base font-medium leading-relaxed text-[var(--fg-muted)] sm:text-lg">
                {heroSubtitle}
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                to={primaryCtaHref}
                className="group inline-flex items-center justify-center gap-3 rounded-full bg-gradient-to-r from-brand via-brand/90 to-black px-8 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_20px_50px_rgba(239,68,68,0.35)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_rgba(239,68,68,0.45)]"
              >
                {primaryCtaLabel}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link
                to={secondaryCtaHref}
                className="inline-flex items-center justify-center gap-3 rounded-full border border-[var(--border-strong)] bg-[var(--bg-card)] px-8 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-[var(--fg-default)] transition hover:border-brand hover:text-brand"
              >
                <Play className="h-4 w-4" />
                {secondaryCtaLabel}
              </Link>
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center">
            <div className="relative h-[320px] w-[320px] max-w-full rounded-[40px] border border-brand/20 bg-gradient-to-br from-black via-neutral-900 to-neutral-800 p-8 text-white shadow-[0_40px_80px_rgba(0,0,0,0.45)] dark:border-brand/30">
              <div className="absolute inset-0 rounded-[40px] bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.6),_transparent_60%)] opacity-60" />
              <div className="relative z-10 flex h-full flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.42em] text-brand/80">Live Price</p>
                    <p className="mt-3 text-4xl font-black tracking-tight text-white">$BTC</p>
                  </div>
                  <span className="rounded-full bg-brand/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-brand">24h +3.5%</span>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.32em] text-neutral-400">
                    <span>Lightning Speed</span>
                    <span>Secure Custody</span>
                  </div>
                  <div className="relative h-24 overflow-hidden rounded-3xl border border-brand/30 bg-black/40">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(239,68,68,0.5),transparent_70%)]" />
                    <div className="absolute inset-0 animate-[float_6s_ease-in-out_infinite] bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.25),transparent_65%)]" />
                    <div className="relative flex h-full items-center justify-center text-4xl font-black tracking-[0.32em] text-brand/80">
                      ₿
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <span className="absolute -top-10 -right-6 hidden h-28 w-28 animate-[float_5s_ease-in-out_infinite] rounded-full border border-brand/50 bg-[var(--bg-card)]/80 text-center text-4xl font-black text-brand shadow-[0_30px_60px_rgba(239,68,68,0.35)] backdrop-blur sm:flex">
              <span className="m-auto">₿</span>
            </span>
            <span className="absolute -bottom-10 -left-6 hidden h-24 w-24 animate-[float_7s_ease-in-out_infinite] rounded-full border border-brand/30 bg-brand/10 text-center text-3xl font-black text-brand shadow-[0_30px_60px_rgba(239,68,68,0.35)] sm:flex">
              <span className="m-auto">∞</span>
            </span>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-6xl space-y-12 px-4 py-16 sm:px-6">
        <div className="space-y-3 text-center">
          <h2 className="text-2xl font-black uppercase tracking-[0.16em]">Build Your Edge</h2>
          <p className="mx-auto max-w-3xl text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
            Learn from structured lessons, immersive visuals, and guided practice. Every module is designed to keep the most important content above the fold, no matter your device.
          </p>
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          {Array.isArray(sections) && sections.length > 0
            ? sections.map((section: Record<string, any>) => {
                const image = section.SectionImage?.formats?.large?.url ||
                  section.SectionImage?.formats?.medium?.url ||
                  section.SectionImage?.formats?.small?.url ||
                  section.SectionImage?.url ||
                  section.image?.data?.attributes?.url ||
                  "";
                const resolvedImageUrl = image
                  ? image.startsWith("http")
                    ? image
                    : `${import.meta.env.VITE_STRAPI_URL}${image}`
                  : "";

                return (
                  <article
                    key={section.id || section.title}
                    className="group relative overflow-hidden rounded-3xl border border-brand/30 bg-[var(--bg-card)] p-8 shadow-[var(--shadow-soft)] transition hover:-translate-y-1 hover:border-brand hover:shadow-[0_45px_90px_rgba(239,68,68,0.35)]"
                  >
                    <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand/5 via-transparent to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
                    <div className="flex flex-col gap-6">
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="text-xl font-bold uppercase tracking-[0.18em] text-[var(--fg-default)]">
                          {section.H2 || section.title}
                        </h3>
                        <span className="rounded-full border border-brand/40 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.38em] text-brand">
                          Module
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
                        {section.SectionSubHeading || section.body}
                      </p>
                      {resolvedImageUrl ? (
                        <div className="relative overflow-hidden rounded-2xl border border-brand/20 bg-black/5">
                          <img
                            src={resolvedImageUrl}
                            alt={section.H2 || section.title}
                            loading="lazy"
                            className="h-56 w-full rounded-2xl object-cover transition duration-700 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition duration-300 group-hover:opacity-60" />
                        </div>
                      ) : (
                        <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-brand/30 text-xs uppercase tracking-[0.38em] text-brand/60">
                          Visual coming soon
                        </div>
                      )}
                      {(section.ButtonLabel || section.button?.label) && (
                        <a
                          href={section.ButtonUrl || section.button?.href || "#"}
                          className="inline-flex items-center gap-3 self-start rounded-full border border-brand/50 px-6 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:bg-brand hover:text-white"
                        >
                          {section.ButtonLabel || section.button?.label}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </article>
                );
              })
            : null}
        </div>
      </div>
    </div>
  );
}
