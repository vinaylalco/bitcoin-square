import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ShopSkeleton from "../components/shop/ShopSkeleton";
import ProductCard from "../components/shop/ProductCard";
import { fetchProducts } from "../lib/strapi";
import { resolveLocale } from "../utils/locale";

export default function Shop() {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const { data, isLoading, error } = useQuery({
    queryKey: ["products", locale],
    queryFn: () => fetchProducts({ locale }),
  });
  const description = t("shop.description");

  if (isLoading) {
    return <ShopSkeleton />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-brand">
        {t("shop.error")}
      </div>
    );
  }

  const products = data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6">
      <header className="space-y-4 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">{t("shop.label")}</p>
        <h2 className="text-3xl font-black uppercase tracking-[0.16em] text-[var(--fg-default)] sm:text-4xl">
          {t("shop.title")}
        </h2>
        {description && (
          <p className="max-w-2xl text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
            {description}
          </p>
        )}
      </header>
      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {products.length > 0 ? (
          products.map((product) => (
            <ProductCard key={product.documentId} product={product} />
          ))
        ) : (
          <div className="rounded-3xl border border-neutral-200/70 bg-white/80 p-8 text-center text-sm text-neutral-600 dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:text-neutral-300 md:col-span-2 lg:col-span-3">
            No products available right now.
          </div>
        )}
      </div>
    </div>
  );
}
