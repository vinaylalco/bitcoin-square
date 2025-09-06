import CardStack from '../components/education/CardStack';
import { useLessons } from '../components/education/useLessons';

export default function LessonsPage() {
  const { lessons, loading, error } = useLessons();
  if (loading) return <p>Loading...</p>;
  if (error) return <p>Failed to load lessons.</p>;
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Lessons</h1>
      <CardStack lessons={lessons} />
    </div>
  );
}
