import { Link } from 'react-router-dom';
import { useStrapiQuery } from '../hooks/useStrapiQuery';
import type { Home, Lesson } from '../types/strapi';

export default function HomePage() {
  // const { data, isLoading, error } = useStrapiQuery<{ data: Home }>('home', '/api/home?populate=featuredLessons');
  const { data, isLoading, error } = useStrapiQuery<{ data: Home }>(
    'home',
    '/api/home-page?populate[HomePageSection][populate]=SectionImage'
  );

  if (isLoading) return <p>Loading...</p>;
  if (error || !data) return <p>Failed to load home.</p>;

  const home = data.data;
  return (
    <div className="p-6 space-y-4">
      
      <section class="px-4 sm:px-6 pt-8 pb-6">
          <h1 class="text-4xl sm:text-5xl font-extrabold tracking-tight">{home.H1}</h1>
          <p class="mt-3 text-neutral-700 dark:text-neutral-300 text-lg sm:text-xl max-w-3xl">{home.MainSubHeading}</p>
          <div class="mt-4 h-1 w-16 bg-brand rounded-full"></div>
      </section>

      {home?.HomePageSection?.length
      ? home.HomePageSection.map((section) => (
          <div key={section.id} className="px-4 sm:px-6 space-y-10">
            <article className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6 bg-white dark:bg-neutral-900 shadow-sm">
              <div>
                <img
                  key={section.id}
                  src={`${import.meta.env.VITE_STRAPI_URL}${section.SectionImage.formats.small.url}`}
                  alt={section.H2}
                />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold">{section.H2}</h2>
                <p className="mt-3 text-neutral-700 dark:text-neutral-300 text-base sm:text-lg leading-relaxed">
                  {section.SectionSubHeading}
                </p>

                <div className="mt-4">
                  <a
                    href={section.ButtonUrl}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white shadow-sm border border-brand/70 hover:brightness-110 transition"
                    data-discover="true"
                  >
                    {section.ButtonLabel}
                  </a>
                </div>
              </div>
            </article>
          </div>
        ))
      : null}

    </div>
  );
}
