import { Link } from 'react-router-dom';
import { useStrapiQuery } from '../hooks/useStrapiQuery';
import { Home, Lesson } from '../types/strapi';

export default function HomePage() {
  const { data, isLoading, error } = useStrapiQuery<{ data: Home }>('home', '/api/home?populate=featuredLessons');

  if (isLoading) return <p>Loading...</p>;
  if (error || !data) return <p>Failed to load home.</p>;

  const home = data.data.attributes;
  const lessons = home.featuredLessons?.data ?? [];
  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-3xl font-bold">{home.heroTitle}</h1>
        {home.heroSubtitle && <p className="text-neutral-600">{home.heroSubtitle}</p>}
      </header>
      {lessons.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold mb-2">Featured Lessons</h2>
          <ul className="list-disc pl-6">
            {lessons.map((l: Lesson) => (
              <li key={l.id}>
                <Link className="text-brand" to={`/lessons/${l.attributes.slug}`}>{l.attributes.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
