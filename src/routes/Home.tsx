import React from "react";
import { useHomeContent } from "../hooks/useHomeContent";

export default function Home() {
  const { data, loading, error } = useHomeContent();
  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-brand">Failed: {error}</div>;
  const sections = data?.sections ?? [];

  return (
    <div className="px-4 sm:px-6 py-6 space-y-12">
      <header className="text-center">
        <h1 className="text-3xl font-bold">Bitcoin Square</h1>
        <p className="text-neutral-600 dark:text-neutral-300 mt-2">
          Learn Bitcoin with clear lessons and interactive cards.
        </p>
      </header>

      {sections.map((s, i) => (
        <section key={i} className="grid gap-4 sm:grid-cols-2 items-center">
          <div className={`order-${i % 2 === 0 ? "1" : "2"} sm:order-1`}>
            <img src={s.imageUrl} alt={s.title} className="w-full rounded-xl border dark:border-neutral-700" />
          </div>
          <div className={`order-${i % 2 === 0 ? "2" : "1"} sm:order-2`}>
            <h2 className="text-2xl font-semibold mb-2">{s.title}</h2>
            <p className="text-neutral-700 dark:text-neutral-200">{s.body}</p>
          </div>
        </section>
      ))}
    </div>
  );
}
