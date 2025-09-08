import { Link } from "react-router-dom";
import type { LessonPlan } from "../../types/lesson-plan";

interface Props {
  course: LessonPlan;
}

export default function CourseCard({ course }: Props) {
  return (
    <Link
      to={`/education/${course.slug}`}
      className="border rounded-lg overflow-hidden flex flex-col hover:shadow"    
    >
      {course.coverImage && (
        <img
          src={course.coverImage}
          alt={course.title || "Course cover"}
          className="aspect-video object-cover"
          loading="lazy"
        />
      )}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-lg mb-2">{course.title}</h3>
        {course.description && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400 flex-1">
            {course.description}
          </p>
        )}
      </div>
    </Link>
  );
}
