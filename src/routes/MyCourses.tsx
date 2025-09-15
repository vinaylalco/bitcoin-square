import { Link } from 'react-router-dom';
import { useMyPurchases } from '../hooks/useMyPurchases';

export default function MyCourses() {
  const { data, isLoading, error } = useMyPurchases();

  if (isLoading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4">Failed to load purchases.</div>;

  const courses = data?.filter((p) => p.paymentStatus === 'paid') ?? [];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">My Courses</h1>
      {courses.length === 0 && <p>You have not purchased any courses yet.</p>}
      <ul className="space-y-2">
        {courses.map((p) => (
          <li key={p.id}>
            <Link to={`/education/${p.lessonPlan.slug}`} className="text-brand underline">
              {p.lessonPlan.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
