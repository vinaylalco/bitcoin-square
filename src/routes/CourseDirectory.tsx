import { useTranslation } from "react-i18next";
import { useLessonPlans } from "../hooks/useLessonPlans";
import CourseCard from "../components/course/CourseCard";

export default function CourseDirectory() {
  const { i18n } = useTranslation();
  const locale = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
  const { data, isLoading, error } = useLessonPlans(locale);

  if (isLoading && !data) {
    return (
      <div className="p-4 space-y-2 animate-pulse">
        <div className="h-6 bg-neutral-200 rounded w-1/3" />
        <div className="h-4 bg-neutral-200 rounded w-full" />
        <div className="h-4 bg-neutral-200 rounded w-5/6" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-brand">Failed to load courses.</div>;
  }

  const courses = data || [];

  return (
    <div className="px-4 sm:px-6 pb-24">
      <h1 className="text-2xl font-bold mb-6">Education</h1>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <CourseCard key={String(course.id || course.slug)} course={course} />
        ))}
      </div>
    </div>
  );
}
