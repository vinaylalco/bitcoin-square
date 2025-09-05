import { useParams } from 'react-router-dom';
import { useStrapiQuery } from '../hooks/useStrapiQuery';
import { Lesson } from '../types/strapi';

export default function LessonDetailPage() {
  const { slug } = useParams();
  const { data, isLoading, error } = useStrapiQuery<{ data: Lesson[] }>('lesson', `/api/lessons?filters[slug][$eq]=${slug}`);
  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Failed to load lesson.</p>;
  const lesson = data?.data?.[0];
  if (!lesson) return <p>Lesson not found.</p>;
  const attrs = lesson.attributes;
  return (
    <article className="p-6 space-y-4">
      <h1 className="text-3xl font-bold">{attrs.title}</h1>
      {attrs.summary && <p>{attrs.summary}</p>}
      {attrs.content && (
        <div className="prose" dangerouslySetInnerHTML={{ __html: attrs.content }} />
      )}
    </article>
  );
}
