import { supabase } from "../../lib/supabase";
import type { HomeFile } from "../../hooks/useHomeContent";
import type { TopicFile } from "../../components/education/types";

export async function loadHomeBoth(): Promise<{ en: HomeFile; es: HomeFile }> {
  async function fetchHome(lang: "en" | "es"): Promise<HomeFile> {
    const { data } = supabase.storage.from("homepage").getPublicUrl(`home.${lang}.json`);
    const res = await fetch(data.publicUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`home ${lang} fetch failed: ${res.status}`);
    const json = (await res.json()) as HomeFile;
    return { hero: json.hero ?? { title: "", subtitle: "" }, sections: Array.isArray(json.sections) ? json.sections : [] };
  }
  const [en, es] = await Promise.all([fetchHome("en"), fetchHome("es")]);
  return { en, es };
}

export async function loadLessonsBoth(): Promise<{ en: TopicFile; es: TopicFile }> {
  async function fetchLessons(lang: "en" | "es"): Promise<TopicFile> {
    const { data } = supabase.storage.from("lessons").getPublicUrl(`lessons.${lang}.json`);
    const res = await fetch(data.publicUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`lessons ${lang} fetch failed: ${res.status}`);
    return res.json();
  }
  const [en, es] = await Promise.all([fetchLessons("en"), fetchLessons("es")]);
  return { en, es };
}
