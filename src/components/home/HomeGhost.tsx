export default function HomeGhost() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-80">
          <div className="absolute -top-44 right-1/3 h-72 w-72 rounded-full bg-brand/30 blur-3xl" />
          <div className="absolute top-1/3 -left-20 h-64 w-64 rounded-full bg-brand/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-neutral-900/70 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 lg:px-8">
          <div className="flex animate-pulse flex-col items-center gap-8 text-center md:items-start md:text-left">
            <div className="space-y-6 md:max-w-3xl">
              <div className="h-8 w-32 rounded-full border border-brand/40 bg-brand/10" />
              <div className="h-12 w-full rounded-2xl bg-neutral-800 sm:h-16" />
              <div className="h-4 w-11/12 rounded-full bg-neutral-800" />
            </div>
            <div className="h-1 w-24 rounded-full bg-brand/70" />
          </div>
        </div>
      </div>

      <div className="relative z-10 -mt-10 pb-24">
        <div className="mx-auto max-w-6xl space-y-16 px-4 sm:px-6 lg:px-8">
          {[1, 2, 3].map((item) => (
            <section key={item} className="relative">
              <div className="group relative overflow-hidden rounded-3xl border border-neutral-800/70 bg-neutral-900/70 shadow-[0_35px_120px_rgba(0,0,0,0.45)] backdrop-blur-sm">
                <div className="grid gap-10 p-6 sm:p-10 md:grid-cols-2">
                  <div className="space-y-6 text-center md:space-y-7 md:text-left">
                    <div className="h-10 w-3/4 rounded-full bg-neutral-800 md:w-2/3" />
                    <div className="space-y-3">
                      <div className="h-4 w-full rounded-full bg-neutral-800" />
                      <div className="h-4 w-11/12 rounded-full bg-neutral-800" />
                      <div className="h-4 w-10/12 rounded-full bg-neutral-800" />
                    </div>
                    <div className="flex justify-center md:justify-start">
                      <div className="h-11 w-36 rounded-full bg-brand/60" />
                    </div>
                  </div>

                  <div className="relative">
                    <div className="aspect-[4/3] w-full overflow-hidden rounded-3xl border border-neutral-800/80 bg-neutral-950/60">
                      <div className="h-full w-full bg-neutral-800" />
                    </div>
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
