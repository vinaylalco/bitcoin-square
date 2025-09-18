import React from "react";
import { Link } from "react-router-dom";
import type { Product } from "../../types/product";
import { resolveMedia, resolveExternal } from "../../lib/strapi";

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const img = product.ProductImages?.[0];
  const imageUrl = resolveMedia(img?.url);
  const alt = img?.alternativeText || product.ProductName;
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-brand/30 bg-[var(--bg-card)] shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:border-brand hover:shadow-[0_45px_90px_rgba(169,21,255,0.35)]">
      <div className="absolute inset-0 bg-gradient-to-br from-brand/10 via-transparent to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
      {img ? (
        <div className="relative overflow-hidden">
          <img
            src={imageUrl}
            alt={alt || product.ProductName}
            className="h-52 w-full object-cover transition duration-700 group-hover:scale-110"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-70" />
          <span className="absolute left-4 top-4 rounded-full border border-white/30 bg-black/60 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-white">
            ${product.Price}
          </span>
        </div>
      ) : (
        <div className="flex h-52 items-center justify-center border-b border-brand/20 bg-gradient-to-br from-brand/5 via-transparent to-transparent text-xs uppercase tracking-[0.38em] text-brand/70">
          Preview coming soon
        </div>
      )}
      <div className="relative flex flex-1 flex-col gap-4 p-6">
        <div className="space-y-2">
          <h3 className="text-lg font-bold uppercase tracking-[0.18em] text-[var(--fg-default)]">
            {product.ProductName}
          </h3>
          <p
            className="text-sm leading-relaxed text-[var(--fg-muted)]"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
            }}
          >
            {product.Description}
          </p>
        </div>
        <div className="mt-auto flex flex-col gap-3">
          <Link
            to={`/shop/${product.documentId}`}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-brand/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:border-brand hover:bg-brand hover:text-white"
          >
            View Details
          </Link>
          <a
            href={resolveExternal(product.ButtonLink)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand via-brand/90 to-black px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-white shadow-[0_20px_45px_rgba(169,21,255,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_60px_rgba(169,21,255,0.45)]"
          >
            {product.ButtonLabel || "Buy now"}
          </a>
        </div>
      </div>
    </article>
  );
}
