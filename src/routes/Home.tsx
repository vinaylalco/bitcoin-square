import { useStrapiQuery } from '../hooks/useStrapiQuery';
import type { Home } from '../types/strapi';
import HomeGhost from '../components/home/HomeGhost';

export default function HomePage() {
  const { data, isLoading, error } = useStrapiQuery<{ data: Home }>(
    'home',
    '/api/home-page?populate[HomePageSection][populate]=SectionImage'
  );

  if (isLoading) return <HomeGhost />;
  if (error || !data) return <p>Failed to load home.</p>;

  const home = data.data;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 transition-colors duration-300 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-neutral-50 to-neutral-200 opacity-95 transition-colors duration-500 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950" />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-48 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl transition-colors duration-500 dark:bg-brand/30" />
          <div className="absolute top-16 right-24 h-64 w-64 rounded-full bg-gradient-to-br from-brand/25 via-transparent to-transparent blur-3xl transition-colors duration-500 dark:from-brand/35" />
          <div className="absolute bottom-24 -left-16 h-56 w-56 rounded-full bg-neutral-200/80 blur-3xl transition-colors duration-500 dark:bg-neutral-900/70" />
          <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-neutral-200/70 blur-3xl transition-colors duration-500 dark:bg-neutral-900/80" />
          <div className="absolute inset-x-6 top-20 h-px bg-gradient-to-r from-transparent via-brand/30 to-transparent transition-colors duration-500 dark:via-brand/50" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-neutral-200/80 via-transparent to-transparent transition-colors duration-500 dark:from-neutral-900/80" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-24 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-10 text-center md:items-start md:text-left">
            <div className="space-y-6 md:max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/15 px-3 py-1 text-sm font-semibold uppercase tracking-widest text-brand transition-colors duration-300 dark:border-brand/40 dark:bg-brand/20">
                Bitcoin Square
              </span>
              <h1 className="text-4xl font-black leading-tight text-neutral-900 drop-shadow-[0_15px_35px_rgba(239,68,68,0.18)] transition-colors duration-300 dark:text-white dark:drop-shadow-[0_15px_35px_rgba(239,68,68,0.28)] sm:text-5xl md:text-6xl">
                {home.H1}
              </h1>
              <p className="text-lg leading-relaxed text-neutral-600 transition-colors duration-300 dark:text-neutral-300 sm:text-xl">
                {home.MainSubHeading}
              </p>
            </div>
            <div className="h-1 w-28 rounded-full bg-gradient-to-r from-brand/80 via-brand to-brand/60 transition-colors duration-300 dark:from-brand dark:via-brand/80 dark:to-brand/60" />
          </div>
        </div>
      </div>

      <div className="relative z-10 -mt-10 pb-24">
        <div className="mx-auto max-w-6xl space-y-16 px-4 sm:px-6 lg:px-8">
          {home?.HomePageSection?.length
            ? home.HomePageSection.map((section, index) => {
                const imageUrl =
                  section.SectionImage?.formats?.large?.url ??
                  section.SectionImage?.formats?.medium?.url ??
                  section.SectionImage?.formats?.small?.url ??
                  section.SectionImage?.url ??
                  '';
                const resolvedImageUrl = imageUrl
                  ? imageUrl.startsWith('http')
                    ? imageUrl
                    : `${import.meta.env.VITE_STRAPI_URL}${imageUrl}`
                  : '';
                const isEven = index % 2 === 1;
                const textOrder = isEven ? 'md:order-2' : 'md:order-1';
                const imageOrder = isEven ? 'md:order-1' : 'md:order-2';

                return (
                  <section key={section.id} className="relative">
                    <div className="group relative overflow-hidden rounded-3xl border border-neutral-200/70 bg-white/80 shadow-[0_25px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm transition-all duration-500 dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:shadow-[0_35px_120px_rgba(0,0,0,0.45)]">
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-transparent transition-colors duration-500 dark:from-neutral-900/40" />
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.16),_transparent_60%)] transition-colors duration-500 dark:bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.25),_transparent_55%)]" />
                      <div className="pointer-events-none absolute -top-24 left-12 h-40 w-40 rounded-full border border-dashed border-brand/20 blur-lg transition-colors duration-500 dark:border-brand/40" />
                      <div className="pointer-events-none absolute -bottom-28 right-12 h-48 w-48 rounded-full bg-brand/10 blur-3xl transition-colors duration-500 dark:bg-brand/25" />
                      <div className="grid gap-10 p-6 sm:p-10 md:grid-cols-2">
                        <div className={`space-y-6 text-center md:space-y-7 md:text-left ${textOrder}`}>
                          <h2 className="text-3xl font-bold text-neutral-900 transition-colors duration-300 dark:text-white sm:text-4xl">
                            {section.H2}
                          </h2>
                          <p className="text-base leading-relaxed text-neutral-600 transition-colors duration-300 dark:text-neutral-300 sm:text-lg">
                            {section.SectionSubHeading}
                          </p>
                          <div className="flex justify-center md:justify-start">
                            <a
                              href={section.ButtonUrl}
                              className="inline-flex items-center gap-2 rounded-full border border-brand/50 bg-brand px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow-[0_12px_40px_rgba(239,68,68,0.25)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(239,68,68,0.35)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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

                        <div className={`relative ${imageOrder}`}>
                          <div className="relative overflow-hidden rounded-3xl border border-neutral-200/80 bg-neutral-100/80 shadow-inner transition-colors duration-500 dark:border-neutral-800/80 dark:bg-neutral-950/60">
                            <div className="absolute -inset-px rounded-3xl bg-gradient-to-tr from-brand/30 via-brand/10 to-transparent opacity-60 blur transition duration-500 group-hover:opacity-80 dark:from-brand/40 dark:via-brand/20" />
                            {resolvedImageUrl ? (
                              <img
                                src={resolvedImageUrl}
                                alt={section.H2}
                                loading="lazy"
                                className="relative h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                              />
                            ) : (
                              <div className="relative flex aspect-[4/3] items-center justify-center bg-neutral-100 text-neutral-400 transition-colors duration-300 dark:bg-neutral-900 dark:text-neutral-500">
                                <span className="text-sm uppercase tracking-[0.3em]">Image coming soon</span>
                              </div>
                            )}
                          </div>
                          <div className="pointer-events-none absolute -bottom-10 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-brand/15 blur-3xl transition-colors duration-500 dark:bg-brand/30" />
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })
            : null}
        </div>
      </div>
    </div>
  );
}
