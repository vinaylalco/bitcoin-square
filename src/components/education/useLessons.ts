import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TopicFile, LessonCardData } from "./types";

export function useLessons() {
  const { i18n } = useTranslation();
  const [state, setState] = useState<{ lessons: LessonCardData[]; loading: boolean; error?: string }>({
    lessons: [],
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      setState({ lessons: [], loading: true, error: undefined });
      const lang = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
      try {
        const mod = await import(`../../data/lessons.${lang}.json`);
        const data = (mod as any).default as TopicFile;
        const flat = data.course.modules.flatMap((m) =>
          m.topics.flatMap((t) =>
            t.cards.map((c) => ({
              ...c,
              topicName: t.name,
              moduleName: m.name,
            })),
          ),
        );
        if (alive) setState({ lessons: flat, loading: false });
      } catch (e: any) {
        if (alive) setState({ lessons: [], loading: false, error: e?.message || "load error" });
      }
    })();
    return () => { alive = false; };
  }, [i18n.language]);

  return state;
}
