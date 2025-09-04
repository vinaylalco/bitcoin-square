import { supabase } from "../../lib/supabase";
import type { HomeFile } from "../../hooks/useHomeContent";
import type { TopicFile } from "../../components/education/types";

function normalizeHome(input: any): HomeFile {
  return {
    hero: input?.hero
      ? {
          title: typeof input.hero.title === "string" ? input.hero.title : "",
          subtitle: typeof input.hero.subtitle === "string" ? input.hero.subtitle : "",
        }
      : { title: "", subtitle: "" },
    sections: Array.isArray(input?.sections) ? input.sections : [],
  };
}

function normalizeLessons(input: any): TopicFile {
  const topics = Array.isArray(input?.topics) ? input.topics : [];
  return { topics };
}

async function fetchPublicJSON<T>(bucket: string, key: string, fallback: T): Promise<T> {
  const { data } = supabase.storage.from(bucket).getPublicUrl(key);
  const res = await fetch(data.publicUrl, { cache: "no-store" });
  if (res.status === 404) return fallback;          // treat missing file as empty
  if (!res.ok) throw new Error(`${bucket}/${key} ${res.status}`);
  return (await res.json()) as T;
}

export async function loadHomeAll(): Promise<{ en: HomeFile; es: HomeFile; id: HomeFile }> {
  const [enRaw, esRaw, idRaw] = await Promise.all([
    fetchPublicJSON<any>("homepage", "home.en.json", { hero: { title: "", subtitle: "" }, sections: [] }),
    fetchPublicJSON<any>("homepage", "home.es.json", { hero: { title: "", subtitle: "" }, sections: [] }),
    fetchPublicJSON<any>("homepage", "home.id.json", { hero: { title: "", subtitle: "" }, sections: [] }),
  ]);
  return { en: normalizeHome(enRaw), es: normalizeHome(esRaw), id: normalizeHome(idRaw) };
}

export async function loadLessonsAll(): Promise<{ en: TopicFile; es: TopicFile; id: TopicFile }> {
  const [enRaw, esRaw, idRaw] = await Promise.all([
    fetchPublicJSON<any>("lessons", "lessons.en.json", { topics: [] }),
    fetchPublicJSON<any>("lessons", "lessons.es.json", { topics: [] }),
    fetchPublicJSON<any>("lessons", "lessons.id.json", { topics: [] }),
  ]);
  return { en: normalizeLessons(enRaw), es: normalizeLessons(esRaw), id: normalizeLessons(idRaw) };
}
