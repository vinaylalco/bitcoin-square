import { useEffect, useState } from "react";

export type BlogPost = {
  id: string;
  title: string; // HTML
  content: string; // HTML
};

const KEY = "bsq.blog.v1";

const normalizeBlogPosts = (value: unknown): BlogPost[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is BlogPost => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    const record = entry as BlogPost;
    return (
      typeof record.id === "string" &&
      typeof record.title === "string" &&
      typeof record.content === "string"
    );
  });
};

function load(): BlogPost[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return normalizeBlogPosts(parsed);
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
  save(normalizeBlogPosts(list));
}

export function useBlogPosts() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    setPosts(load());
    setIsLoading(false);
  }, []);
  const addPost = (post: BlogPost) => {
    const updated = [...posts, post];
    setPosts(updated);
    save(normalizeBlogPosts(updated));
  };
  return { posts, addPost, setPosts, isLoading };
}
