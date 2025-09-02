import React, { useRef, useState, useEffect } from "react";
import type { BlogPost } from "../../hooks/useBlogPosts";
import { getBlogPosts, setBlogPosts } from "../../hooks/useBlogPosts";

export default function BlogEditor() {
  const [posts, setPostsState] = useState<BlogPost[]>([]);
  const [title, setTitle] = useState("");
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPostsState(getBlogPosts());
  }, []);

  const addPost = (e: React.FormEvent) => {
    e.preventDefault();
    const content = editorRef.current?.innerHTML || "";
    if (!title || !content) return;
    const newPost: BlogPost = { id: Date.now().toString(), title, content };
    const updated = [...posts, newPost];
    setPostsState(updated);
    setBlogPosts(updated);
    setTitle("");
    if (editorRef.current) editorRef.current.innerHTML = "";
  };

  return (
    <div className="space-y-6">
      <form onSubmit={addPost} className="space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent"
        />
        <div
          ref={editorRef}
          contentEditable
          className="w-full min-h-[160px] px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
        />
        <button type="submit" className="px-4 py-2 rounded bg-brand text-white text-sm">
          Add Post
        </button>
      </form>

      <div className="space-y-4">
        {posts.map((p) => (
          <article key={p.id} className="border-b pb-2">
            <h3 className="font-semibold">{p.title}</h3>
          </article>
        ))}
        {posts.length === 0 && <p className="opacity-70">No posts.</p>}
      </div>
    </div>
  );
}
