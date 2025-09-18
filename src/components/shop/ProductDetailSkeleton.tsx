import Skeleton from "../ui/Skeleton";

export default function ProductDetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-16 sm:px-6">
      <Skeleton className="h-6 w-24 rounded-full" />
      <Skeleton className="h-10 w-2/3 rounded-full" />
      <Skeleton className="h-6 w-1/3 rounded-full" />
      <Skeleton className="h-96 w-full rounded-3xl" />
      <Skeleton className="h-12 w-48 rounded-full" />
    </div>
  );
}
