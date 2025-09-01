import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";
import type { TopicFile, LessonCardData } from "./types";

async function fetchJsonPublic(bucket: string, path: string): Promise<any> {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const url = data.publicUrl;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  return res.json();
}

export function useLessons() {
  const { i18n } = useTranslation();
  const [state, setState] = useState<{ lessons: LessonCardData[]; loading: boolean; error?: string }>({
    lessons: [],
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: undefined }));
      const lang = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
      try {
        const data = (await fetchJsonPublic("lessons", `lessons.${lang}.json`)) as TopicFile;
        const flat = data.topics.flatMap((t) => t.cards.map((c) => ({ ...c, topicName: t.name })));
        if (alive) setState({ lessons: flat, loading: false });
      } catch (e: any) {
        // Fallback to local for dev
        try {
          const mod = await import(`../../data/lessons.${lang}.json`);
          const data = (mod as any).default as TopicFile;
          const flat = data.topics.flatMap((t) => t.cards.map((c) => ({ ...c, topicName: t.name })));
          if (alive) setState({ lessons: flat, loading: false, error: `storage: ${e?.message}` });
        } catch (e2: any) {
          if (alive) setState({ lessons: [], loading: false, error: e2?.message || "load error" });
        }
      }
    })();
    return () => { alive = false; };
  }, [i18n.language]);

  return state;
}
