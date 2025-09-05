import { Link, useSearchParams } from 'react-router-dom';
import { useStrapiQuery } from '../hooks/useStrapiQuery';
import { Lesson } from '../types/strapi';

export default function LessonsPage() {
  const [params] = useSearchParams();
  const lang = params.get('language');
  const level = params.get('level');
  const filters = [] as string[];
  if (lang) filters.push(`filters[language][code][$eq]=${lang}`);
  if (level) filters.push(`filters[level][$eq]=${level}`);
  const query = filters.length ? `?${filters.join('&')}` : '';

  const { data, isLoading, error } = useStrapiQuery<{ data: Lesson[] }>('lessons', `/api/lessons${query}`);
  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Failed to load lessons.</p>;
  const lessons = data?.data ?? [];
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Lessons</h1>
      {lessons.length === 0 && <p>No lessons found.</p>}
      <ul className="space-y-2">
        {lessons.map((l) => (
          <li key={l.id}>
            <Link className="text-brand" to={`/lessons/${l.attributes.slug}`}>{l.attributes.title}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
