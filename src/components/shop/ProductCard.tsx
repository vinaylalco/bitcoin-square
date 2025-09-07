import React from "react";
import { Link } from "react-router-dom";
import type { Product } from "../../types/product";
import { resolveMedia } from "../../lib/strapi";

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const { id, attributes } = product;
  const img = attributes.ProductImages?.data?.[0]?.attributes;
  const imageUrl = resolveMedia(img?.url);
  const alt = img?.alternativeText || attributes.ProductName;
  return (
    <div className="border rounded-lg overflow-hidden flex flex-col">
      {img && (
        <img
          src={imageUrl}
          alt={alt}
          className="aspect-video object-cover"
          loading="lazy"
        />
      )}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-lg mb-1">{attributes.ProductName}</h3>
        <p className="text-sm opacity-70 mb-2">{attributes.Price}</p>
        <p
          className="text-sm flex-1 mb-4"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}
        >
          {attributes.Description}
        </p>
        <div className="mt-auto flex gap-2">
          <Link
            to={`/shop/${id}`}
            className="flex-1 text-center rounded bg-neutral-200 dark:bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-300 dark:hover:bg-neutral-700"
          >
            Learn more
          </Link>
          <a
            href={attributes.ButtonLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center rounded bg-brand text-white px-3 py-2 text-sm hover:bg-brand/90"
          >
            {attributes.ButtonLabel || "Buy now"}
          </a>
        </div>
      </div>
    </div>
  );
}
