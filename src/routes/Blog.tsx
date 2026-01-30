import React from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useBlogPosts } from "../hooks/useBlogPosts";
import { safeArray, safeString } from "../utils/safeTypes";

export default function Blog() {
  const { t } = useTranslation();
  const { posts, isLoading } = useBlogPosts();
  const safePosts = safeArray(posts);

  if (isLoading) {
    return (
      <div className="flex w-full items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--fg-muted)]" aria-hidden />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-8">
      <h1 className="text-3xl font-bold">{t("blog.title")}</h1>
      {safePosts.map((p) => (
        <article key={p.id} className="space-y-2">
          <h2
            className="text-xl font-semibold"
            dangerouslySetInnerHTML={{ __html: safeString(p.title) }}
          />
          <div
            className="prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: safeString(p.content) }}
          />
        </article>
      ))}
      {safePosts.length === 0 && <p className="opacity-70">{t("blog.empty")}</p>}
    </div>
  );
}
