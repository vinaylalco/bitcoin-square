import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchLessons } from "../../lib/strapi";
import type { LessonCardData } from "./types";

export function useLessons() {
  const { i18n } = useTranslation();
  const [state, setState] = useState<{ lessons: LessonCardData[]; loading: boolean; error?: string }>({
    lessons: [],
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      setState({ lessons: [], loading: true });
      const lang = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
      try {
        const flat = await fetchLessons(lang);
        if (alive) setState({ lessons: flat, loading: false });
      } catch (e: any) {
        if (alive) setState({ lessons: [], loading: false, error: e?.message || "load error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [i18n.language]);

  return state;
}
