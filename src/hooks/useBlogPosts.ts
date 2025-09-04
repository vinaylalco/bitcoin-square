import { useEffect, useState } from "react";

export type BlogPost = {
  id: number;
  title: string;
  content: string;
};

const API_URL = import.meta.env.VITE_STRAPI_URL || "http://localhost:1337";

export function useBlogPosts() {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/blog-posts`)
      .then((res) => res.json())
      .then((json) => {
        const data = Array.isArray(json.data)
          ? json.data.map((item: any) => ({
              id: item.id,
              title: item.attributes?.title ?? "",
              content: item.attributes?.content ?? "",
            }))
          : [];
        setPosts(data);
      })
      .catch(() => setPosts([]));
  }, []);

  return { posts };
}
