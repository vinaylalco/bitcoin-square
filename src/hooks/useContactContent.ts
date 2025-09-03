import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchContactContent } from "../lib/strapi";

export type SocialLink = { label: string; url: string };
export type ContactContent = {
  title: string; // HTML
  body: string; // HTML
  socials: SocialLink[];
};

export function useContactContent() {
  const { i18n } = useTranslation();
  const [content, setContent] = useState<ContactContent>({ title: "", body: "", socials: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let alive = true;
    const lang: "en" | "es" = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
    (async () => {
      setLoading(true);
      try {
        const data = await fetchContactContent(lang);
        if (alive) setContent(data);
      } catch (e: any) {
        if (alive) setError(e?.message || "Failed to load contact content");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [i18n.language]);

  return { content, loading, error };
}
