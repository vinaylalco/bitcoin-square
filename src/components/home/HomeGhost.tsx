export default function HomeGhost() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 transition-colors duration-300 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-neutral-50 to-neutral-200 opacity-95 transition-colors duration-500 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950" />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-48 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl transition-colors duration-500 dark:bg-brand/30" />
          <div className="absolute top-16 right-24 h-64 w-64 rounded-full bg-gradient-to-br from-brand/25 via-transparent to-transparent blur-3xl transition-colors duration-500 dark:from-brand/35" />
          <div className="absolute bottom-24 -left-16 h-56 w-56 rounded-full bg-neutral-200/80 blur-3xl transition-colors duration-500 dark:bg-neutral-900/70" />
          <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-neutral-200/70 blur-3xl transition-colors duration-500 dark:bg-neutral-900/80" />
          <div className="absolute inset-x-6 top-20 h-px bg-gradient-to-r from-transparent via-brand/30 to-transparent transition-colors duration-500 dark:via-brand/50" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-neutral-200/80 via-transparent to-transparent transition-colors duration-500 dark:from-neutral-900/80" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-24 sm:px-6 lg:px-8">
          <div className="flex animate-pulse flex-col items-center gap-10 text-center md:items-start md:text-left">
            <div className="space-y-6 md:max-w-3xl">
              <div className="h-8 w-32 rounded-full border border-brand/20 bg-brand/15 transition-colors duration-300 dark:border-brand/40 dark:bg-brand/25" />
              <div className="h-12 w-full rounded-2xl bg-neutral-200 transition-colors duration-300 sm:h-16 dark:bg-neutral-800" />
              <div className="h-4 w-11/12 rounded-full bg-neutral-200 transition-colors duration-300 dark:bg-neutral-800" />
            </div>
            <div className="h-1 w-28 rounded-full bg-gradient-to-r from-brand/80 via-brand to-brand/60 transition-colors duration-300 dark:from-brand dark:via-brand/80 dark:to-brand/60" />
          </div>
        </div>
      </div>

      <div className="relative z-10 -mt-10 pb-24">
        <div className="mx-auto max-w-6xl space-y-16 px-4 sm:px-6 lg:px-8">
          {[1, 2, 3].map((item) => (
            <section key={item} className="relative">
              <div className="group relative overflow-hidden rounded-3xl border border-neutral-200/70 bg-white/80 shadow-[0_25px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm transition-all duration-500 dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:shadow-[0_35px_120px_rgba(0,0,0,0.45)]">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-transparent transition-colors duration-500 dark:from-neutral-900/40" />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.16),_transparent_60%)] transition-colors duration-500 dark:bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.25),_transparent_55%)]" />
                <div className="pointer-events-none absolute -top-24 left-12 h-40 w-40 rounded-full border border-dashed border-brand/20 blur-lg transition-colors duration-500 dark:border-brand/40" />
                <div className="pointer-events-none absolute -bottom-28 right-12 h-48 w-48 rounded-full bg-brand/10 blur-3xl transition-colors duration-500 dark:bg-brand/25" />
                <div className="grid gap-10 p-6 sm:p-10 md:grid-cols-2">
                  <div className="space-y-6 text-center md:space-y-7 md:text-left">
                    <div className="h-10 w-3/4 rounded-full bg-neutral-200 transition-colors duration-300 md:w-2/3 dark:bg-neutral-800" />
                    <div className="space-y-3">
                      <div className="h-4 w-full rounded-full bg-neutral-200 transition-colors duration-300 dark:bg-neutral-800" />
                      <div className="h-4 w-11/12 rounded-full bg-neutral-200 transition-colors duration-300 dark:bg-neutral-800" />
                      <div className="h-4 w-10/12 rounded-full bg-neutral-200 transition-colors duration-300 dark:bg-neutral-800" />
                    </div>
                    <div className="flex justify-center md:justify-start">
                      <div className="h-11 w-36 rounded-full bg-brand/70 transition-colors duration-300 dark:bg-brand/60" />
                    </div>
                  </div>

                  <div className="relative">
                    <div className="aspect-[4/3] w-full overflow-hidden rounded-3xl border border-neutral-200/80 bg-neutral-100/80 transition-colors duration-500 dark:border-neutral-800/80 dark:bg-neutral-950/60">
                      <div className="h-full w-full bg-neutral-200 transition-colors duration-300 dark:bg-neutral-800" />
                    </div>
                    <div className="pointer-events-none absolute -bottom-10 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-brand/15 blur-3xl transition-colors duration-500 dark:bg-brand/30" />
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
