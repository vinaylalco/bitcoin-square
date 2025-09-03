import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchBlogPosts } from "../lib/strapi";

export type BlogPost = {
  id: string;
  title: string; // HTML
  content: string; // HTML
};

export function useBlogPosts() {
  const { i18n } = useTranslation();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let alive = true;
    const lang: "en" | "es" = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
    (async () => {
      setLoading(true);
      try {
        const list = await fetchBlogPosts(lang);
        if (alive) setPosts(list);
      } catch (e: any) {
        if (alive) setError(e?.message || "Failed to load posts");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [i18n.language]);

  return { posts, loading, error };
}
