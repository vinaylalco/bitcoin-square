import React from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchProduct, resolveMedia, resolveExternal } from "../lib/strapi";

export default function ProductDetail() {
  const { id: documentId } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["product", documentId],
    queryFn: () => fetchProduct(documentId as string),
    enabled: !!documentId,
  });

  if (isLoading) {
    return (
      <div className="p-4">
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p>Failed to load product.</p>
        <Link to="/shop" className="text-brand underline">
          Back to Shop
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center">
        <p>Product not found.</p>
        <Link to="/shop" className="text-brand underline">
          Back to Shop
        </Link>
      </div>
    );
  }

  const product = data;
  const images = product.ProductImages || [];
  const [index, setIndex] = React.useState(0);

  const prev = () =>
    setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);

  return (
    <div className="max-w-screen-md mx-auto p-4 space-y-4">
      <Link to="/shop" className="text-sm text-brand hover:underline">
        Back to Shop
      </Link>
      <h2 className="text-3xl font-bold">{product.ProductName}</h2>
      <p className="text-xl">${product.Price}</p>
      {images.length > 0 && (
        <div className="relative overflow-hidden rounded-lg">
          <div
            className="flex transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {images.map((img, idx) => (
              <img
                key={idx}
                src={resolveMedia(img.url)}
                alt={img.alternativeText || product.ProductName}
                className="w-full flex-shrink-0 object-cover aspect-video"
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
                className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/75"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={next}
                aria-label="Next image"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/75"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
      <p className="whitespace-pre-line">{product.Description}</p>
      <a
        href={resolveExternal(product.ButtonLink)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block bg-brand text-white px-4 py-2 rounded hover:bg-brand/90"
      >
        {product.ButtonLabel || "Buy now"}
      </a>
      <Link to="/shop" className="block text-sm text-brand hover:underline">
        Back to Shop
      </Link>
    </div>
  );
}
