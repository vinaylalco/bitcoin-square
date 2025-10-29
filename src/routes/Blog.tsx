import React from "react";
import { useTranslation } from "react-i18next";
import { useBlogPosts } from "../hooks/useBlogPosts";

export default function Blog() {
  const { t } = useTranslation();
  const { posts } = useBlogPosts();

  return (
    <div className="px-4 sm:px-6 py-6 space-y-8">
      <h1 className="text-3xl font-bold">{t("blog.title")}</h1>
      {posts.map((p) => (
        <article key={p.id} className="space-y-2">
          <h2
            className="text-xl font-semibold"
            dangerouslySetInnerHTML={{ __html: p.title }}
          />
          <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: p.content }} />
        </article>
      ))}
      {posts.length === 0 && <p className="opacity-70">{t("blog.empty")}</p>}
    </div>
  );
}
