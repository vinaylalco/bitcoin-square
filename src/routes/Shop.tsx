import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ShopSkeleton from "../components/shop/ShopSkeleton";
import ProductCard from "../components/shop/ProductCard";
import { fetchProducts } from "../lib/strapi";

export default function Shop() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
  const { data, isLoading, error } = useQuery({
    queryKey: ["products", locale],
    queryFn: () => fetchProducts(1, 12, locale),
  });

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

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6">
      <header className="space-y-4 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">{t("shop.label")}</p>
        <h2 className="text-3xl font-black uppercase tracking-[0.16em] text-[var(--fg-default)] sm:text-4xl">
          {t("shop.title")}
        </h2>
        <p className="max-w-2xl text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
          {t("shop.description")}
        </p>
      </header>
      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {data && data.map((p) => <ProductCard key={p.documentId} product={p} />)}
      </div>
    </div>
  );
}
