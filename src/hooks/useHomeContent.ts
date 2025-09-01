import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";

export type HomeSection = { imageUrl: string; title: string; body: string };
export type HomeFile = { sections: HomeSection[] };

async function fetchJsonPublic(bucket: string, path: string): Promise<any> {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const url = data.publicUrl;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  return res.json();
}

export function useHomeContent() {
  const { i18n } = useTranslation();
  const [state, setState] = useState<{ data?: HomeFile; loading: boolean; error?: string }>({
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      setState({ loading: true });
      const lang = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
      try {
        const data = (await fetchJsonPublic("homepage", `home.${lang}.json`)) as HomeFile;
        if (alive) setState({ data, loading: false });
      } catch (e: any) {
        try {
          const mod = await import(`../data/home.${lang}.json`);
          if (alive) setState({ data: (mod as any).default as HomeFile, loading: false, error: e?.message });
        } catch (e2: any) {
          if (alive) setState({ loading: false, error: e2?.message || "load error" });
        }
      }
    })();
    return () => { alive = false; };
  }, [i18n.language]);

  return state;
}
