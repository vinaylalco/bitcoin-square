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
    <div className="border rounded-lg overflow-hidden flex flex-col">
      {img && (
        <img
          src={imageUrl}
          alt={alt || product.ProductName}
          className="aspect-video object-cover"
          loading="lazy"
        />
      )}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-lg mb-1">{product.ProductName}</h3>
        <p className="text-sm opacity-70 mb-2">{product.Price}</p>
        <p
          className="text-sm flex-1 mb-4"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}
        >
          {product.Description}
        </p>
        <div className="mt-auto flex gap-2">
          <Link
            to={`/shop/${product.documentId}`}
            className="flex-1 text-center rounded bg-neutral-200 dark:bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-300 dark:hover:bg-neutral-700"
          >
            Learn more
          </Link>
          <a
            href={resolveExternal(product.ButtonLink)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center rounded bg-brand text-white px-3 py-2 text-sm hover:bg-brand/90"
          >
            {product.ButtonLabel || "Buy now"}
          </a>
        </div>
      </div>
    </div>
  );
}
