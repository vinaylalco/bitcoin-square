import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";

export type CTA = {
  label: string;
  href: string;
};

export type HomeSection = {
  imageUrl: string;
  title: string;
  body: string;
  cta?: CTA;
  shape?: "round" | "square" | "blob";
};

export type HomeFile = {
  hero?: {
    title: string;
    subtitle: string;
  };
  sections: HomeSection[];
};

type State = { content: HomeFile | null; loading: boolean; error?: string };

const TTL_MS = 10 * 60 * 1000; // 10 min

function cacheKey(lang: "en" | "es" | "id") {
  return `bsq.home.${lang}.v1`;
}
function readCache(lang: "en" | "es" | "id"): HomeFile | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(lang));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: HomeFile };
    if (!ts || Date.now() - ts > TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}
function writeCache(lang: "en" | "es" | "id", data: HomeFile) {
  try {
    sessionStorage.setItem(cacheKey(lang), JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

async function fetchHome(lang: "en" | "es" | "id"): Promise<HomeFile> {
  const { data } = supabase.storage.from("homepage").getPublicUrl(`home.${lang}.json`);
  const res = await fetch(data.publicUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`home ${lang} fetch failed: ${res.status}`);
  const json = (await res.json()) as HomeFile;
  return {
    hero: json.hero ?? undefined,
    sections: Array.isArray(json.sections) ? json.sections : [],
  };
}

export function useHomeContent(): State {
  const { i18n } = useTranslation();
  const lang: "en" | "es" | "id" = i18n.language?.toLowerCase().startsWith("es")
    ? "es"
    : i18n.language?.toLowerCase().startsWith("id")
    ? "id"
    : "en";

  // Seed from cache to avoid flicker on return visits
  const cached = readCache(lang);
  const [state, setState] = useState<State>({
    content: cached,
    loading: !cached, // if cached exists, render immediately without loading state
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const fresh = await fetchHome(lang);
        if (!alive) return;
        writeCache(lang, fresh);
        setState({ content: fresh, loading: false });
      } catch (e: any) {
        // fallback to EN if not already EN
        if (lang !== "en") {
          try {
            const freshEn = await fetchHome("en");
            if (!alive) return;
            writeCache("en", freshEn);
            setState({ content: freshEn, loading: false, error: e?.message });
            return;
          } catch (e2: any) {
            if (!alive) return;
            setState({ content: state.content, loading: false, error: e2?.message || "Failed to load home content" });
            return;
          }
        }
        if (!alive) return;
        setState({ content: state.content, loading: false, error: e?.message || "Failed to load home content" });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]); // re-run when language changes

  return state;
}
