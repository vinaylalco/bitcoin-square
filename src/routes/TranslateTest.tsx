import Translator from "../components/Translator";

/**
 * Simple route that renders the standalone translation demo so it can be
 * exercised without disturbing the primary application layout.
 */
export default function TranslateTest() {
  return (
    <div className="bg-[var(--bg-app)] text-[var(--fg-default)]">
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <header className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">
            Experimental
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">LibreTranslate playground</h1>
          <p className="mx-auto max-w-2xl text-sm text-[var(--fg-muted)]">
            Use this page to verify LibreTranslate connectivity without affecting the
            rest of the Bitcoin Square experience.
          </p>
        </header>

        <Translator />
      </div>
    </div>
  );
}
