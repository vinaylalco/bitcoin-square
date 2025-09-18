import Skeleton from "../ui/Skeleton";

export default function LessonDetailSkeleton() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-16">
      <Skeleton className="h-10 w-3/4 rounded-full" />
      <Skeleton className="h-4 w-full rounded-full" />
      <Skeleton className="h-4 w-11/12 rounded-full" />
      <Skeleton className="h-64 w-full rounded-3xl" />
    </article>
  );
}
