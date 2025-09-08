import React from "react";
import { useQuery } from "@tanstack/react-query";
import ProductCard from "../components/shop/ProductCard";
import { fetchProducts } from "../lib/strapi";

export default function Shop() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProducts(),
  });

  if (isLoading) {
    return (
      <div className="max-w-screen-lg mx-auto p-4">
        <h2 className="text-2xl font-semibold mb-4">Shop</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="border rounded-lg h-60 motion-safe:animate-pulse bg-neutral-200 dark:bg-neutral-800"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p>Failed to load products.</p>
      </div>
    );
  }

  return (
    <div className="max-w-screen-lg mx-auto p-4">
      <h2 className="text-2xl font-semibold mb-4">Shop</h2>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {data && data.map((p) => <ProductCard key={p.documentId} product={p} />)}
      </div>
    </div>
  );
}
