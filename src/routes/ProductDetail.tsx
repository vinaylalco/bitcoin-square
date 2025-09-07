import React from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchProduct, resolveMedia } from "../lib/strapi";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["product", id],
    queryFn: () => fetchProduct(id as string),
    enabled: !!id,
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

  const { attributes } = data;
  const images = attributes.ProductImages?.data || [];

  return (
    <div className="max-w-screen-md mx-auto p-4 space-y-4">
      <Link to="/shop" className="text-sm text-brand hover:underline">
        Back to Shop
      </Link>
      <h2 className="text-3xl font-bold">{attributes.ProductName}</h2>
      <p className="text-xl">{attributes.Price}</p>
      <div className="flex flex-col gap-4">
        {images.map((img, idx) => (
          <img
            key={idx}
            src={resolveMedia(img.attributes.url)}
            alt={img.attributes.alternativeText || attributes.ProductName}
            className="w-full rounded-lg object-cover"
            loading="lazy"
          />
        ))}
      </div>
      <p className="whitespace-pre-line">{attributes.Description}</p>
      <a
        href={attributes.ButtonLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block bg-brand text-white px-4 py-2 rounded hover:bg-brand/90"
      >
        {attributes.ButtonLabel || "Buy now"}
      </a>
      <Link to="/shop" className="block text-sm text-brand hover:underline">
        Back to Shop
      </Link>
    </div>
  );
}
