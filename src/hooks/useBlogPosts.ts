import { useEffect, useState } from "react";

export type BlogPost = {
  id: string;
  title: string; // HTML
  content: string; // HTML
};

const KEY = "bsq.blog.v1";

function load(): BlogPost[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BlogPost[]) : [];
  } catch {
    return [];
  }
}

function save(list: BlogPost[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export function getBlogPosts(): BlogPost[] {
  return load();
}

export function setBlogPosts(list: BlogPost[]) {
  save(list);
}

export function useBlogPosts() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  useEffect(() => {
    setPosts(load());
  }, []);
  const addPost = (post: BlogPost) => {
    const updated = [...posts, post];
    setPosts(updated);
    save(updated);
  };
  return { posts, addPost, setPosts };
}
