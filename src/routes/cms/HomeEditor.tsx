import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { HomeFile } from "../../hooks/useHomeContent";
import { useRole } from "../../hooks/useRole";
import { saveJson } from "../../lib/cmsClient";

type Locale = "en" | "es";

async function fetchHome(lang: Locale): Promise<HomeFile> {
  const { data } = supabase.storage.from("homepage").getPublicUrl(`home.${lang}.json`);
  const res = await fetch(data.publicUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.json();
}

function validateHome(data: unknown): asserts data is HomeFile {
  const ok =
    !!data &&
    Array.isArray((data as any).sections) &&
    (data as any).sections.every(
      (s: any) =>
        s &&
        typeof s.imageUrl === "string" &&
        typeof s.title === "string" &&
        typeof s.body === "string"
    );
  if (!ok) throw new Error("Invalid home content structure");
}

// Direct client upload (requires Storage insert/update policy for 'homepage' bucket to authenticated users)
async function uploadImage(file: File): Promise<string> {
  const key = `images/${Date.now()}_${file.name}`.replace(/\s+/g, "_");
  const { error } = await supabase.storage.from("homepage").upload(key, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("homepage").getPublicUrl(key);
  return data.publicUrl;
}

export default function HomeEditor() {
  const { role, loading: roleLoading } = useRole();
  const [tab, setTab] = useState<Locale>("en");
  const [data, setData] = useState<Record<Locale, HomeFile | null>>({ en: null, es: null });
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [en, es] = await Promise.all([fetchHome("en"), fetchHome("es")]);
        if (alive) setData({ en, es });
      } catch (e: any) {
        console.error("HomeEditor fetch error:", e?.message || e);
        setErrorMsg(String(e?.message || e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const current = data[tab];

  if (roleLoading) return <div className="p-4">Checking permissions…</div>;
  if (role !== "admin") return <div className="p-4 text-brand">403 — Admins only</div>;
  if (!current) return <div className="p-4">{errorMsg ? `Error: ${errorMsg}` : "Loading…"}</div>;

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
    const copy = { ...current, sections: [...current.sections, { imageUrl: "", title: "", body: "" }] };
    setData((d) => ({ ...d, [tab]: copy }));
  };

  const remove = (i: number) => {
    const copy = { ...current, sections: [...current.sections] };
    copy.sections.splice(i, 1);
    setData((d) => ({ ...d, [tab]: copy }));
  };

  const onPickImage = async (i: number, file?: File | null) => {
    if (!file) return;
    try {
      setUploadingIdx(i);
      const url = await uploadImage(file);
      updateSection(i, "imageUrl", url);
    } catch (e: any) {
      alert(`Upload failed: ${e.message || e}`);
    } finally {
      setUploadingIdx(null);
    }
  };

  const save = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      validateHome(current);
      const res = await saveJson("home", tab, current);
      console.info("[cms] save result:", res);
      alert(`Home saved via ${res?.via || "function"}.`);
    } catch (e: any) {
      console.error("HomeEditor save error:", e?.message || e);
      setErrorMsg(String(e?.message || e));
      alert(`Save failed: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Language Tabs */}
      <div className="inline-flex rounded-xl border dark:border-neutral-700 overflow-hidden">
        <button className={`px-3 py-1.5 text-sm ${tab === "en" ? "bg-brand text-white" : ""}`} onClick={() => setTab("en")}>EN</button>
        <button className={`px-3 py-1.5 text-sm ${tab === "es" ? "bg-brand text-white" : ""}`} onClick={() => setTab("es")}>ES</button>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {current.sections.map((s, i) => (
          <div key={i} className="rounded-xl border dark:border-neutral-700 p-4">
            <div className="flex flex-col sm:flex-row gap-3 mb-3">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Image URL</label>
                <input
                  className="w-full bg-transparent border-b dark:border-neutral-700"
                  placeholder="https://…"
                  value={s.imageUrl}
                  onChange={(e) => updateSection(i, "imageUrl", e.target.value)}
                />
                {s.imageUrl && (
                  <img
                    src={s.imageUrl}
                    alt={s.title || `section-${i}`}
                    className="mt-2 h-28 w-auto rounded border dark:border-neutral-700 object-cover"
                  />
                )}
              </div>

              <div className="sm:w-56">
                <label className="block text-sm font-medium mb-1">Upload image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onPickImage(i, e.target.files?.[0] ?? null)}
                />
                {uploadingIdx === i && <p className="text-xs mt-1">Uploading…</p>}
              </div>
            </div>

            <div className="flex gap-2 mb-2">
              <input
                className="flex-1 bg-transparent border-b dark:border-neutral-700"
                placeholder="Title"
                value={s.title}
                onChange={(e) => updateSection(i, "title", e.target.value)}
              />
            </div>

            <textarea
              className="w-full bg-transparent border rounded p-3 min-h-40"
              rows={6}
              placeholder="Paragraph…"
              value={s.body}
              onChange={(e) => updateSection(i, "body", e.target.value)}
            />

            <div className="mt-3 flex gap-2">
              <button className="px-2 py-1 border rounded" onClick={() => move(i, i - 1)}>↑ Section</button>
              <button className="px-2 py-1 border rounded" onClick={() => move(i, i + 1)}>↓ Section</button>
              <button className="px-2 py-1 border rounded" onClick={() => remove(i)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button className="px-3 py-1.5 border rounded" onClick={add}>+ Add Section</button>
        <button
          className="px-4 py-2 rounded-lg border dark:border-neutral-700 bg-brand text-white"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save EN/ES Current Tab"}
        </button>
      </div>

      {errorMsg && (
        <p className="text-sm text-brand/90">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
