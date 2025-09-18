import Skeleton from "../ui/Skeleton";

export default function LanguagesSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-12 sm:px-6">
      <Skeleton className="h-6 w-32 rounded-full" />
      <Skeleton className="mt-3 h-10 w-72 rounded-full" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 5 }).map((_, idx) => (
          <Skeleton key={idx} className="h-12 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
