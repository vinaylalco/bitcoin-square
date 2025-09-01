import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TopicFile, LessonCardData } from "./types";

// Keep imports statically analyzable for Vite
const loaders = {
  en: () => import("../../data/lessons.en.json"),
  es: () => import("../../data/lessons.es.json"),
};

export function useLessons(): {
  lessons: LessonCardData[];
  loading: boolean;
  error?: string;
} {
  const { i18n } = useTranslation();
  const [state, setState] = useState<{
    lessons: LessonCardData[];
    loading: boolean;
    error?: string;
  }>({ lessons: [], loading: true });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setState((s) => ({ ...s, loading: true, error: undefined }));

      // device/site language -> 'es' or 'en' (fallback)
      const lang = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";

      try {
        const mod = await (loaders[lang] ?? loaders.en)();
        const data = (mod as any).default as TopicFile;

        const flattened: LessonCardData[] = data.topics.flatMap((t) =>
          t.cards.map((c) => ({ ...c, topicName: t.name }))
        );

        if (!cancelled) setState({ lessons: flattened, loading: false });
      } catch (e: any) {
        try {
          const modEn = await loaders.en();
          const dataEn = (modEn as any).default as TopicFile;
          const flattenedEn: LessonCardData[] = dataEn.topics.flatMap((t) =>
            t.cards.map((c) => ({ ...c, topicName: t.name }))
          );
          if (!cancelled)
            setState({
              lessons: flattenedEn,
              loading: false,
              error: e?.message || "Failed to load lessons",
            });
        } catch (e2: any) {
          if (!cancelled)
            setState({
              lessons: [],
              loading: false,
              error: e2?.message || "Failed to load lessons",
            });
        }
      }
    }

    run();
    // reload when language changes
  }, [i18n.language]);

  return state;
}
