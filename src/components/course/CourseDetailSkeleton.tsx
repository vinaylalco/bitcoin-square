import Skeleton from "../ui/Skeleton";

export default function CourseDetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6">
      <Skeleton className="mb-6 h-10 w-64 rounded-full" />
      <Skeleton className="mb-4 h-6 w-5/6 rounded-full" />
      <Skeleton className="mb-10 h-48 w-full rounded-3xl" />
      <Skeleton className="h-96 w-full rounded-3xl" />
    </div>
  );
}
