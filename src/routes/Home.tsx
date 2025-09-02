import React from "react";
import { Link } from "react-router-dom";
import { useHomeContent } from "../hooks/useHomeContent";
import "../components/home/BlobMask.css";

function shapeClasses(shape: "round" | "square" | "blob"): string {
  switch (shape) {
    case "round":
      return "rounded-full aspect-square overflow-hidden";
    case "square":
      return "rounded-xl overflow-hidden";
    case "blob":
      return "blob-mask overflow-hidden";
  }
}
function autoShapeByIndex(i: number): "round" | "square" | "blob" {
  return (["round", "square", "blob"] as const)[i % 3];
}
function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith("//");
}

export default function Home() {
  const { content, loading, error } = useHomeContent();

  // ❌ No skeleton on Home: render nothing while loading (header/bottom-nav remain)
  if (loading && !content) return null;

  if (error && !content) {
    return (
      <div className="p-6">
        <p className="text-brand font-medium">Failed to load home content.</p>
        <p className="text-sm opacity-70 mt-1">{String(error)}</p>
      </div>
    );
  }

  const c = content!;
  const heroTitle = c.hero?.title || c.sections[0]?.title || "Bitcoin Square";
  const heroSub = c.hero?.subtitle || c.sections[0]?.body || "";

  return (
    <div className="pb-6">
      {/* Hero */}
      <section className="px-4 sm:px-6 pt-8 pb-6">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">{heroTitle}</h1>
        {heroSub && (
          <p className="mt-3 text-neutral-700 dark:text-neutral-300 text-lg sm:text-xl max-w-3xl">
            {heroSub}
          </p>
        )}
        <div className="mt-4 h-1 w-16 bg-brand rounded-full" />
      </section>

      {/* Sections */}
      <div className="px-4 sm:px-6 space-y-10">
        {c.sections.map((s, i) => {
          const shape = s.shape ?? autoShapeByIndex(i);
          const imgClass = shapeClasses(shape);
          const alt = s.title || `section-${i}`;
          const cta = s.cta && s.cta.label && s.cta.href ? s.cta : undefined;

          const media = s.imageUrl ? (
            <img
              src={s.imageUrl}
              alt={alt}
              className={`w-full h-56 sm:h-72 object-cover border border-neutral-200 dark:border-neutral-800 ${shape === "round" ? "p-1 bg-white dark:bg-neutral-900" : ""} ${imgClass}`}
              loading="lazy"
            />
          ) : (
            <div
              className={`w-full h-56 sm:h-72 grid place-items-center text-sm opacity-70 border border-dashed border-neutral-300 dark:border-neutral-700 ${imgClass}`}
            >
              No image
            </div>
          );

          const text = (
            <div className={i % 2 === 0 ? "" : "md:order-1"}>
              {s.title && <h2 className="text-2xl sm:text-3xl font-bold">{s.title}</h2>}
              {s.body && (
                <p className="mt-3 text-neutral-700 dark:text-neutral-300 text-base sm:text-lg leading-relaxed">
                  {s.body}
                </p>
              )}
              {cta && (
                <div className="mt-4">
                  {isExternal(cta.href) ? (
                    <a
                      href={cta.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white shadow-sm border border-brand/70 hover:brightness-110 transition"
                    >
                      {cta.label}
                    </a>
                  ) : (
                    <Link
                      to={cta.href}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white shadow-sm border border-brand/70 hover:brightness-110 transition"
                    >
                      {cta.label}
                    </Link>
                  )}
                </div>
              )}
            </div>
          );

          return (
            <article
              key={i}
              className="
                grid grid-cols-1 md:grid-cols-2 gap-5 items-center
                rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6
                bg-white dark:bg-neutral-900 shadow-sm
              "
            >
              <div className={i % 2 === 0 ? "" : "md:order-2"}>{media}</div>
              {text}
            </article>
          );
        })}
      </div>
    </div>
  );
}
