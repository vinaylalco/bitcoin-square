import Skeleton from "../ui/Skeleton";

export default function HomeGhost() {
  return (
    <div className="relative isolate overflow-hidden bg-[var(--bg-app)] text-[var(--fg-default)]">
      <div className="relative border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 left-20 h-80 w-80 rounded-full bg-gradient-to-br from-brand/40 via-brand/10 to-transparent blur-3xl" />
          <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-gradient-to-br from-black/60 via-brand/20 to-transparent blur-3xl opacity-70" />
        </div>
        <div className="relative mx-auto flex max-w-6xl flex-col gap-16 px-4 pb-16 pt-12 sm:px-6 lg:flex-row lg:items-center lg:gap-20">
          <div className="flex-1 space-y-8">
            <Skeleton className="h-8 w-48 rounded-full" />
            <div className="space-y-4">
              <Skeleton className="h-12 w-full rounded-3xl" />
              <Skeleton className="h-4 w-3/4 rounded-2xl" />
              <Skeleton className="h-4 w-2/3 rounded-2xl" />
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Skeleton className="h-12 w-48 rounded-full" />
              <Skeleton className="h-12 w-48 rounded-full" />
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="relative h-[320px] w-[320px] max-w-full">
              <Skeleton className="h-full w-full rounded-[40px] border border-brand/20 bg-[var(--bg-muted)]" />
              <Skeleton className="absolute -top-8 -right-6 hidden h-24 w-24 rounded-full sm:block" />
              <Skeleton className="absolute -bottom-10 -left-6 hidden h-20 w-20 rounded-full sm:block" />
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-6">
        <div className="space-y-3 text-center">
          <Skeleton className="mx-auto h-6 w-40 rounded-full" />
          <Skeleton className="mx-auto h-4 w-2/3 rounded-full" />
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <article key={idx} className="rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-8 shadow-[var(--shadow-soft)]">
              <div className="flex flex-col gap-6">
                <div className="flex items-start justify-between gap-4">
                  <Skeleton className="h-6 w-32 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full rounded-2xl" />
                <Skeleton className="h-4 w-5/6 rounded-2xl" />
                <Skeleton className="h-48 w-full rounded-3xl" />
                <Skeleton className="h-10 w-36 rounded-full" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
