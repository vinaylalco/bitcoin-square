export default function HomeGhost() {
  return (
    <div className="p-6 space-y-8 animate-pulse">
      <div className="space-y-4">
        <div className="h-10 bg-neutral-200 rounded w-1/2" />
        <div className="h-4 bg-neutral-200 rounded w-2/3" />
        <div className="h-1 w-16 bg-brand rounded-full" />
      </div>
      <div className="space-y-10">
        {[1, 2].map((n) => (
          <div
            key={n}
            className="px-4 sm:px-6 space-y-10"
          >
            <article className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6 bg-white dark:bg-neutral-900 shadow-sm">
              <div className="h-48 bg-neutral-200 dark:bg-neutral-700 rounded" />
              <div className="space-y-4">
                <div className="h-6 bg-neutral-200 rounded w-3/4" />
                <div className="h-4 bg-neutral-200 rounded w-full" />
                <div className="h-4 bg-neutral-200 rounded w-5/6" />
                <div className="h-10 bg-neutral-200 rounded w-32" />
              </div>
            </article>
          </div>
        ))}
      </div>
    </div>
  );
}
