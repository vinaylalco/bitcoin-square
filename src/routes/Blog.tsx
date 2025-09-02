import React from "react";
import { useBlogPosts } from "../hooks/useBlogPosts";

export default function Blog() {
  const { posts } = useBlogPosts();

  return (
    <div className="px-4 sm:px-6 py-6 space-y-8">
      <h1 className="text-3xl font-bold">Blog</h1>
      {posts.map((p) => (
        <article key={p.id} className="space-y-2">
          <h2 className="text-xl font-semibold">{p.title}</h2>
          <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: p.content }} />
        </article>
      ))}
      {posts.length === 0 && <p className="opacity-70">No posts yet.</p>}
    </div>
  );
}
