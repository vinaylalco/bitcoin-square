import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { HomeFile } from "../../hooks/useHomeContent";
import { useRole } from "../../hooks/userole";

type Locale = "en" | "es";

async function fetchHome(lang: Locale): Promise<HomeFile> {
  const { data } = supabase.storage
    .from("homepage")
    .getPublicUrl(`home.${lang}.json`);
  const res = await fetch(data.publicUrl, { cache: "no-store" });
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

async function saveHome(lang: Locale, content: HomeFile) {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cms_replace_file`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type: "home", locale: lang, content }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function HomeEditor() {
  const { role, loading: roleLoading } = useRole();
  const [tab, setTab] = useState<Locale>("en");
  const [data, setData] = useState<Record<Locale, HomeFile | null>>({
    en: null,
    es: null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [en, es] = await Promise.all([fetchHome("en"), fetchHome("es")]);
      if (alive) setData({ en, es });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const current = data[tab];

  // 🔒 Role checks
  if (roleLoading) return <div className="p-4">Checking role…</div>;
  if (role !== "admin")
    return <div className="p-4 text-brand">403 — Admins only</div>;
  if (!current) return <div className="p-4">Loading…</div>;

  const updateSection = (
    idx: number,
    key: keyof (typeof current)["sections"][number],
    value: string
  ) => {
    const copy = { ...current, sections: [...current.sections] };
    copy.sections[idx] = { ...copy.sections[idx], [key]: value } as any;
    setData((d) => ({ ...d, [tab]: copy }));
  };

  const move = (from: number, to: number) => {
    const copy = { ...current, sections: [...current.sections] };
    if (to < 0 || to >= copy.sections.length) return;
    const [sp] = copy.sections.splice(from, 1);
    copy.sections.splice(to, 0, sp);
    setData((d) => ({ ...d, [tab]: copy }));
  };

  const add = () => {
    const copy = {
      ...current,
      sections: [...current.sections, { imageUrl: "", title: "", body: "" }],
    };
    setData((d) => ({ ...d, [tab]: copy }));
  };

  const remove = (i: number) => {
    const copy = { ...current, sections: [...current.sections] };
    copy.sections.splice(i, 1);
    setData((d) => ({ ...d, [tab]: copy }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveHome(tab, current);
      alert("Home saved.");
    } catch (e: any) {
      alert(`Save failed: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Language Tabs */}
      <div className="inline-flex rounded-xl border dark:border-neutral-700 overflow-hidden">
        <button
          className={`px-3 py-1.5 text-sm ${
            tab === "en" ? "bg-brand text-white" : ""
          }`}
          onClick={() => setTab("en")}
        >
          EN
        </button>
        <button
          className={`px-3 py-1.5 text-sm ${
            tab === "es" ? "bg-brand text-white" : ""
          }`}
          onClick={() => setTab("es")}
        >
          ES
        </button>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {current.sections.map((s, i) => (
          <div
            key={i}
            className="rounded-xl border dark:border-neutral-700 p-4"
          >
            <div className="flex gap-2 mb-2">
              <input
                className="flex-1 bg-transparent border-b dark:border-neutral-700"
                placeholder="Image URL"
                value={s.imageUrl}
                onChange={(e) => updateSection(i, "imageUrl", e.target.value)}
              />
              <input
                className="flex-1 bg-transparent border-b dark:border-neutral-700"
                placeholder="Title"
                value={s.title}
                onChange={(e) => updateSection(i, "title", e.target.value)}
              />
            </div>
            <textarea
              className="w-full bg-transparent border rounded p-2"
              rows={3}
              placeholder="Paragraph…"
              value={s.body}
              onChange={(e) => updateSection(i, "body", e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button
                className="px-2 py-1 border rounded"
                onClick={() => move(i, i - 1)}
              >
                ↑ Section
              </button>
              <button
                className="px-2 py-1 border rounded"
                onClick={() => move(i, i + 1)}
              >
                ↓ Section
              </button>
              <button
                className="px-2 py-1 border rounded"
                onClick={() => remove(i)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button className="px-3 py-1.5 border rounded" onClick={add}>
          + Add Section
        </button>
        <button
          className="px-4 py-2 rounded-lg border dark:border-neutral-700 bg-brand text-white"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save EN/ES Current Tab"}
        </button>
      </div>
    </div>
  );
}
