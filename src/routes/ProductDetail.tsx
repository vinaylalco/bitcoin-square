import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ProductDetailSkeleton from "../components/shop/ProductDetailSkeleton";
import { fetchProduct, resolveMedia, resolveExternal } from "../lib/strapi";
import { resolveLocale } from "../utils/locale";

export default function ProductDetail() {
  const { id: documentId } = useParams<{ id: string }>();
  const { i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);

  const { data, isLoading, error } = useQuery({
    queryKey: ["product", documentId, locale],
    queryFn: () => fetchProduct(documentId as string, locale),
    enabled: !!documentId,
  });

  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [data]);

  if (isLoading) {
    return <ProductDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-brand">
        <p>Failed to load product.</p>
        <Link to="/shop" className="mt-4 inline-flex items-center justify-center rounded-full border border-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:bg-brand hover:text-white">
          Back to Shop
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-[var(--fg-muted)]">
        <p>Product not found.</p>
        <Link to="/shop" className="mt-4 inline-flex items-center justify-center rounded-full border border-brand px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:bg-brand hover:text-white">
          Back to Shop
        </Link>
      </div>
    );
  }

  const product = data;
  const images = product.ProductImages || [];

  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-12 sm:px-6">
      <Link
        to="/shop"
        className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:translate-x-1"
      >
        ← Back to Shop
      </Link>
      <div className="mt-6 overflow-hidden rounded-3xl border border-brand/30 bg-[var(--bg-card)] shadow-[var(--shadow-soft)]">
        <div className="grid gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <div className="relative overflow-hidden rounded-3xl border border-brand/30 bg-black/10">
              {images.length > 0 ? (
                <div className="relative">
                  <div
                    className="flex transition-transform duration-500 ease-out"
                    style={{ transform: `translateX(-${index * 100}%)` }}
                  >
                    {images.map((img, idx) => (
                      <img
                        key={idx}
                        src={resolveMedia(img.url)}
                        alt={img.alternativeText || product.ProductName}
                        className="h-full w-full flex-shrink-0 object-cover"
                        loading="lazy"
                      />
                    ))}
                  </div>
                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={prev}
                        aria-label="Previous image"
                        className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-white/50 bg-black/50 p-3 text-white transition hover:bg-black/70"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={next}
                        aria-label="Next image"
                        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-white/50 bg-black/50 p-3 text-white transition hover:bg-black/70"
                      >
                        ›
                      </button>
                    </>
                  )}
                  <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                    {images.map((_, dotIdx) => (
                      <span
                        key={dotIdx}
                        className={`h-2 w-2 rounded-full ${dotIdx === index ? "bg-brand" : "bg-white/50"}`}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex h-80 items-center justify-center text-xs uppercase tracking-[0.38em] text-brand/60">
                  Preview coming soon
                </div>
              )}
            </div>
            <div className="rounded-3xl border border-brand/20 bg-[var(--bg-card)]/80 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-brand">Description</p>
              <p className="mt-4 text-sm leading-relaxed text-[var(--fg-muted)] whitespace-pre-line">
                {product.Description}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <h2 className="text-3xl font-black uppercase tracking-[0.14em] text-[var(--fg-default)]">
                {product.ProductName}
              </h2>
              <p className="text-xl font-semibold text-brand">${product.Price}</p>
            </div>
            <a
              href={resolveExternal(product.ButtonLink)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-brand via-brand/90 to-[#FFF582] px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_25px_55px_rgba(169,21,255,0.4)] transition hover:-translate-y-1 hover:shadow-[0_35px_70px_rgba(169,21,255,0.45)]"
            >
              {product.ButtonLabel || "Buy now"}
            </a>
            <Link
              to="/shop"
              className="inline-flex items-center justify-center rounded-full border border-brand/40 px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-brand transition hover:border-brand hover:bg-brand hover:text-white"
            >
              Browse more products
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
