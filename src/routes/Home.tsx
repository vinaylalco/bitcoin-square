import { Fragment, useEffect, useState } from "react";
import { strapiFetch } from "../api/strapi-client";

const howItWorks = [
  {
    step: "1️⃣",
    title: "Sign Up",
    description:
      "Create your account and access through Nostr. Complete control, privacy guaranteed.",
  },
  {
    step: "2️⃣",
    title: "Choose Your Plan",
    description:
      "Annual membership ($5/month) or lifetime access ($80). Both with complete access from day one.",
  },
  {
    step: "3️⃣",
    title: "Access the Ecosystem",
    description:
      "Education, community, store and advisory services. All integrated in one professional platform.",
  },
  {
    step: "4️⃣",
    title: "Monetize",
    description:
      "Participate, grow, generate income. Referral program with attractive commissions.",
  },
];

const offerings = [
  {
    icon: "📚",
    title: "Education",
    description:
      "Access structured courses covering Bitcoin fundamentals to advanced investment strategies and security.",
  },
  {
    icon: "👥",
    title: "Community",
    description:
      "Connect with committed bitcoiners, share experiences, create your own community and build professional networks on Nostr.",
  },
  {
    icon: "🛍️",
    title: "Store",
    description:
      "Access to curated products for bitcoiners: hardware wallets, technical literature, premium merchandise and specialized tools.",
  },
  {
    icon: "💼",
    title: "Advisory Services",
    description:
      "Consult with experts on investment strategies, portfolio management and best practices in Bitcoin security.",
  },
];

const roadmap = [
  {
    phase: "Phase 1: Live Now",
    focus: "Education, Community & Store",
    description:
      "Access to professional courses, Nostr community and specialized store. Everything ready for you to start your Bitcoin journey.",
  },
  {
    phase: "Phase 2: Q1 2025",
    focus: "P2P Market",
    description:
      "Exchange Bitcoin and USDT directly between members. No intermediaries, total security and control.",
  },
  {
    phase: "Phase 3: Q2 2025",
    focus: "Lending Solutions",
    description:
      "Access to Bitcoin financing options. Real investment opportunities for serious bitcoiners.",
  },
];

const events = [
  {
    day: "15",
    month: "November",
    title: "Masterclass: Bitcoin Security",
    description: "Learn best practices to secure your Bitcoin. Live session with expert speakers.",
  },
  {
    day: "22",
    month: "November",
    title: "Virtual Meetup: BTC Community",
    description: "Connect with bitcoiners from your region. Networking, Q&A in real time.",
  },
  {
    day: "30",
    month: "November",
    title: "Workshop: Investment Strategies",
    description: "Build your Bitcoin investment strategy. Interactive session with live analysis.",
  },
];

const pricing = [
  {
    name: "Annual",
    price: "$5",
    highlight: "Billed annually ($60/year)",
    suffix: "/month",
    features: [
      "Complete course library access",
      "Unlimited Nostr community",
      "Store access",
      "1 professional consultation per month",
      "Active referral program",
      "Access to events and masterclasses",
    ],
    cta: "Subscribe Now",
    accent: false,
  },
  {
    name: "Lifetime",
    price: "$80",
    highlight: "Permanent and unlimited access",
    suffix: "/one time",
    features: [
      "Complete course library access",
      "Unlimited Nostr community",
      "Store access",
      "Unlimited consultations",
      "Premium referral program",
      "Early access to P2P market",
      "VIP events and exclusive networking",
    ],
    cta: "Get Lifetime",
    accent: true,
  },
];

const ctaCards = [
  {
    title: "🎯 Referrals",
    description: "Earn $20 per annual membership or $25 per lifetime you share with your network",
    cta: "Get Link",
  },
  {
    title: "📅 Events",
    description: "Live masterclasses, virtual meetups and in-person events with expert speakers",
    cta: "View Calendar",
  },
  {
    title: "👤 Dashboard",
    description: "Manage your membership, track your progress and access all your tools",
    cta: "Go to Dashboard",
  },
];

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand via-brand/85 to-[#FFF582] px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_20px_50px_rgba(169,21,255,0.35)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_70px_rgba(169,21,255,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export default function HomePage() {
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [isMembersLoading, setIsMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchMemberCount = async () => {
      try {
        const response = await strapiFetch<{
          data: unknown;
          meta?: {
            pagination?: {
              total?: number;
            };
          };
        }>(
          "/api/members?filters[status][$in]=active,grandfathered&pagination[pageSize]=1",
        );

        if (!isMounted) {
          return;
        }

        const total = response.meta?.pagination?.total;
        if (typeof total === "number") {
          setMemberCount(total);
          setMembersError(false);
        } else {
          setMembersError(true);
          setMemberCount(null);
        }
      } catch {
        if (!isMounted) {
          return;
        }

        setMembersError(true);
        setMemberCount(null);
      } finally {
        if (isMounted) {
          setIsMembersLoading(false);
        }
      }
    };

    fetchMemberCount();

    return () => {
      isMounted = false;
    };
  }, []);

  const heroStats = [
    {
      label: "Active Members",
      value: isMembersLoading
        ? "Loading…"
        : membersError
        ? "-"
        : (memberCount ?? 0).toLocaleString(),
    },
    { label: "Professional Courses", value: "50+" },
  ];

  return (
    <div className="relative min-h-screen space-y-20 overflow-hidden bg-gradient-to-b from-white via-neutral-50 to-neutral-100 px-4 pb-20 pt-10 text-neutral-900 transition-colors duration-500 dark:from-neutral-950 dark:via-neutral-950 dark:to-black dark:text-neutral-100 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl rounded-3xl border border-neutral-200/70 bg-white/80 px-6 py-12 text-center shadow-[0_30px_120px_rgba(15,23,42,0.12)] backdrop-blur-sm transition-colors duration-500 dark:border-neutral-800/60 dark:bg-neutral-900/70 dark:shadow-[0_35px_120px_rgba(0,0,0,0.55)] md:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">Built on Nostr • BTC Only</p>
        <h1 className="mt-6 text-4xl font-black tracking-tight text-neutral-900 transition-colors duration-300 dark:text-white sm:text-5xl lg:text-6xl">
          The Bitcoin Ecosystem <span className="text-brand">You Need</span>
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-neutral-600 transition-colors duration-300 dark:text-neutral-300 sm:text-xl">
          Professional education, community on Nostr and tools. A complete platform for serious bitcoiners.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a href="/community" className={buttonBase}>
            Join the Community
            <span aria-hidden="true" className="text-lg">
              →
            </span>
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-neutral-200/70 bg-white/70 px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-neutral-900 shadow-[0_14px_45px_rgba(15,23,42,0.1)] transition duration-300 hover:-translate-y-0.5 hover:border-brand/70 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-100 dark:hover:text-brand"
          >
            See How It Works
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
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">How it works</p>
          <h2 className="mt-3 text-3xl font-bold text-neutral-900 transition-colors duration-300 dark:text-white sm:text-4xl">
            How BitcoinSquare Works
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
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">Platform</p>
          <h2 className="mt-3 text-3xl font-bold text-neutral-900 transition-colors duration-300 dark:text-white sm:text-4xl">
            What We Offer
          </h2>
          <p className="mt-4 text-base text-neutral-600 transition-colors duration-300 dark:text-neutral-300 sm:text-lg">
            A complete platform built on Nostr that provides everything you need to master Bitcoin.
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
      </section>

      <section className="mx-auto max-w-6xl space-y-10">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">Roadmap</p>
          <h2 className="mt-3 text-3xl font-bold text-neutral-900 transition-colors duration-300 dark:text-white sm:text-4xl">
            Ecosystem Roadmap
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
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">Events</p>
          <h2 className="mt-3 text-3xl font-bold text-neutral-900 transition-colors duration-300 dark:text-white sm:text-4xl">
            Upcoming Events
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {events.map((event) => (
            <article
              key={event.title}
              className="flex h-full flex-col overflow-hidden rounded-3xl border border-neutral-200/70 bg-white/80 shadow-[0_20px_80px_rgba(15,23,42,0.12)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_30px_110px_rgba(169,21,255,0.28)] dark:border-neutral-800/70 dark:bg-neutral-900/70"
            >
              <div className="bg-gradient-to-r from-brand via-brand/80 to-[#FFF582] px-6 py-5 text-left text-white">
                <div className="text-4xl font-black leading-none">{event.day}</div>
                <div className="text-sm uppercase tracking-[0.32em]">{event.month}</div>
              </div>
              <div className="flex flex-1 flex-col gap-4 p-6">
                <h3 className="text-xl font-semibold text-neutral-900 transition-colors duration-300 dark:text-white">
                  {event.title}
                </h3>
                <p className="flex-1 text-sm leading-relaxed text-neutral-600 transition-colors duration-300 dark:text-neutral-300">
                  {event.description}
                </p>
                <a href="/community" className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.32em] text-brand transition hover:text-brand/80">
                  Register
                  <span aria-hidden="true" className="text-base">
                    →
                  </span>
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-10">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">Pricing</p>
          <h2 className="mt-3 text-3xl font-bold text-neutral-900 transition-colors duration-300 dark:text-white sm:text-4xl">
            Plans Designed for You
          </h2>
          <p className="mt-4 text-base text-neutral-600 transition-colors duration-300 dark:text-neutral-300 sm:text-lg">
            Choose the plan that best fits your Bitcoin strategy.
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
                  Recommended
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
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand/80">Take action</p>
          <h2 className="mt-3 text-3xl font-bold text-neutral-900 transition-colors duration-300 dark:text-white sm:text-4xl">
            Join the Bitcoin Era
          </h2>
          <p className="mt-4 text-base text-neutral-600 transition-colors duration-300 dark:text-neutral-300 sm:text-lg">
            Access specialized education, advanced tools and a community of committed bitcoiners. Built for those who seek excellence.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {ctaCards.map((card) => (
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
              <a href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.32em] text-brand transition hover:text-brand/80">
                {card.cta}
                <span aria-hidden="true" className="text-base">
                  →
                </span>
              </a>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl rounded-3xl border border-neutral-200/70 bg-white/80 px-6 py-8 text-center text-sm text-neutral-500 shadow-[0_20px_80px_rgba(15,23,42,0.12)] transition-colors duration-300 dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:text-neutral-400">
        © {new Date().getFullYear()} BitcoinSquare. Bitcoin ecosystem built on Nostr. BTC only.
      </footer>
    </div>
  );
}
