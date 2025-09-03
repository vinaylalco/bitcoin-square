import React, { useState, useEffect } from "react";
import type { BlogPost } from "../../hooks/useBlogPosts";
import { getBlogPosts, setBlogPosts } from "../../hooks/useBlogPosts";
import RichTextEditor from "../../components/RichTextEditor";

export default function BlogEditor() {
  const [posts, setPostsState] = useState<BlogPost[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    setPostsState(getBlogPosts());
  }, []);

  const addPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) return;
    const newPost: BlogPost = { id: Date.now().toString(), title, content };
    const updated = [...posts, newPost];
    setPostsState(updated);
    setBlogPosts(updated);
    setTitle("");
    setContent("");
  };

  return (
    <div className="space-y-6">
      <form onSubmit={addPost} className="space-y-2">
        <RichTextEditor
          value={title}
          onChange={setTitle}
          className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
        />
        <RichTextEditor
          value={content}
          onChange={setContent}
          className="w-full min-h-[160px] px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
        />
        <button type="submit" className="px-4 py-2 rounded bg-brand text-white text-sm">
          Add Post
        </button>
      </form>

      <div className="space-y-4">
        {posts.map((p) => (
          <article key={p.id} className="border-b pb-2">
            <h3
              className="font-semibold"
              dangerouslySetInnerHTML={{ __html: p.title }}
            />
          </article>
        ))}
        {posts.length === 0 && <p className="opacity-70">No posts.</p>}
      </div>
    </div>
  );
}
