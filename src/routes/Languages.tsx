import { Link } from 'react-router-dom';
import { useStrapiQuery } from '../hooks/useStrapiQuery';
import type { Language } from '../types/strapi';

export default function LanguagesPage() {
  const { data, isLoading, error } = useStrapiQuery<{ data: Language[] }>('languages', '/api/languages');
  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Failed to load languages.</p>;
  const languages = data?.data ?? [];
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Languages</h1>
      <ul className="space-y-2">
        {languages.map((lang) => (
          <li key={lang.id}>
            <Link className="text-brand" to={`/lessons?language=${lang.attributes.code}`}>{lang.attributes.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
