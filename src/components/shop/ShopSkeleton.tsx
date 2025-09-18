import Skeleton from "../ui/Skeleton";

export default function ShopSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6">
      <Skeleton className="h-6 w-32 rounded-full" />
      <Skeleton className="mt-3 h-10 w-72 rounded-full" />
      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)]">
            <Skeleton className="mb-4 h-48 w-full rounded-3xl" />
            <Skeleton className="mb-3 h-5 w-2/3 rounded-full" />
            <Skeleton className="mb-2 h-4 w-full rounded-full" />
            <Skeleton className="h-10 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
