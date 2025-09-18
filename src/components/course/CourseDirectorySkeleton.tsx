import Skeleton from "../ui/Skeleton";

export default function CourseDirectorySkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6">
      <div className="space-y-3">
        <Skeleton className="h-6 w-48 rounded-full" />
        <Skeleton className="h-10 w-72 rounded-full" />
      </div>
      <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="overflow-hidden rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
            <Skeleton className="mb-6 h-40 w-full rounded-3xl" />
            <Skeleton className="mb-3 h-6 w-3/4 rounded-full" />
            <Skeleton className="mb-2 h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-5/6 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
