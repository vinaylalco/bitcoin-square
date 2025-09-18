import { useStrapiQuery } from "../hooks/useStrapiQuery";
import type { Home } from "../types/strapi";
import HomeGhost from "../components/home/HomeGhost";
import { cn } from "../utils/cn";

export default function HomePage() {
  const { data, isLoading, error } = useStrapiQuery<{ data: Home }>(
    "home",
    "/api/home-page?populate[HomePageSection][populate]=SectionImage",
  );

  if (isLoading) return <HomeGhost />;
  if (error || !data) return <p className="px-4 py-10 text-brand">Failed to load home.</p>;

  const home = data.data as unknown as Record<string, any>;
  const sections: Array<Record<string, any>> = home?.HomePageSection ?? [];

  return (
    <div className="relative min-h-screen space-y-16 overflow-hidden bg-gradient-to-b from-white via-neutral-50 to-neutral-100 px-4 pb-16 pt-10 text-neutral-900 transition-colors duration-500 dark:from-neutral-950 dark:via-neutral-950 dark:to-black dark:text-neutral-100 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl rounded-3xl border border-neutral-200/70 bg-white/75 px-6 py-12 text-center shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm transition-colors duration-500 dark:border-neutral-800/60 dark:bg-neutral-900/70 dark:shadow-[0_35px_120px_rgba(0,0,0,0.55)] md:text-left">
        <h1 className="text-4xl font-black tracking-tight text-neutral-900 transition-colors duration-300 dark:text-white sm:text-5xl">
          {home.H1}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-neutral-600 transition-colors duration-300 dark:text-neutral-300 sm:text-xl">
          {home.MainSubHeading}
        </p>
        <div className="mt-6 h-1 w-24 rounded-full bg-gradient-to-r from-brand via-brand/80 to-black shadow-[0_12px_30px_rgba(169,21,255,0.35)] transition-colors duration-300 dark:from-brand/80 dark:via-brand dark:to-brand/60 md:ml-0 md:w-28" />
      </section>

      {sections.length
        ? sections.map((section, index) => {
            const imageUrl =
              section.SectionImage?.formats?.large?.url ??
              section.SectionImage?.formats?.medium?.url ??
              section.SectionImage?.formats?.small?.url ??
              section.SectionImage?.url ??
              "";
            const resolvedImageUrl = imageUrl
              ? imageUrl.startsWith("http")
                ? imageUrl
                : `${import.meta.env.VITE_STRAPI_URL}${imageUrl}`
              : "";
            const isEven = index % 2 === 1;

            return (
              <div key={section.id ?? index} className="mx-auto max-w-6xl space-y-10 px-2 sm:px-4">
                <article className="group grid grid-cols-1 items-center gap-8 rounded-3xl border border-neutral-200/70 bg-white/80 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.12)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_25px_110px_rgba(169,21,255,0.28)] dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:shadow-[0_35px_120px_rgba(0,0,0,0.55)] md:grid-cols-2 md:p-10">
                  <div
                    className={cn(
                      "relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-neutral-100/70 shadow-inner transition duration-500 dark:border-neutral-800/70 dark:bg-neutral-950/60",
                      isEven ? "md:order-2" : "md:order-1",
                    )}
                  >
                    {resolvedImageUrl ? (
                      <img
                        src={resolvedImageUrl}
                        alt={section.H2}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center text-sm uppercase tracking-[0.32em] text-neutral-400 transition-colors duration-300 dark:text-neutral-500">
                        Image coming soon
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-brand/20 via-transparent to-transparent opacity-0 transition duration-500 group-hover:opacity-70" />
                  </div>

                  <div
                    className={cn(
                      "space-y-6 text-center transition-colors duration-300 md:text-left",
                      isEven ? "md:order-1" : "md:order-2",
                    )}
                  >
                    <h2 className="text-3xl font-bold text-neutral-900 transition-colors duration-300 dark:text-white">
                      {section.H2}
                    </h2>
                    <p className="text-base leading-relaxed text-neutral-600 transition-colors duration-300 dark:text-neutral-300 sm:text-lg">
                      {section.SectionSubHeading}
                    </p>
                    <div className="flex justify-center md:justify-start">
                      <a
                        href={section.ButtonUrl}
                        className="inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-brand via-brand/85 to-black px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_20px_50px_rgba(169,21,255,0.35)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_70px_rgba(169,21,255,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        data-discover="true"
                      >
                        {section.ButtonLabel}
                        <svg
                          aria-hidden="true"
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M5 12h14M13 6l6 6-6 6"
                            stroke="currentColor"
                            strokeWidth={1.6}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </a>
                    </div>
                  </div>
                </article>
              </div>
            );
          })
        : null}
    </div>
  );
}
