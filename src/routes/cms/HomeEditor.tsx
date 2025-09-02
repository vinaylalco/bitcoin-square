import React, { useState } from "react";
import { supabase } from "../../lib/supabase";
import type { HomeFile, HomeSection, CTA } from "../../hooks/useHomeContent";
import { saveJson } from "../../lib/cmsClient";

type Locale = "en" | "es";

function normalizeHref(input: string): string {
  const href = input.trim();
  if (!href) return "";
  if (href.startsWith("/") || href.startsWith("./") || href.startsWith("../")) return href;
  if (/^https?:\/\//i.test(href) || href.startsWith("//")) return href;
  return href.startsWith("/") ? href : `/${href}`;
}

function validateHome(data: HomeFile) {
  if (!Array.isArray(data.sections)) throw new Error("Invalid sections");
  for (const s of data.sections) {
    if (s.cta) {
      const both = !!s.cta.label && !!s.cta.href;
      const none = !s.cta.label && !s.cta.href;
      if (!both && !none) throw new Error("CTA must have both label and href, or be empty");
    }
  }
}

export default function HomeEditor({
  initial,
}: {
  initial: { en: HomeFile; es: HomeFile };
}) {
  const [tab, setTab] = useState<Locale>("en");
  const [data, setData] = useState<Record<Locale, HomeFile>>({
    en: initial.en,
    es: initial.es,
  });
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  const current = data[tab];
  const setCurrent = (next: HomeFile) => setData((d) => ({ ...d, [tab]: next }));

  const updateHero = (key: "title" | "subtitle", value: string) => {
    setCurrent({ ...current, hero: { ...(current.hero || { title: "", subtitle: "" }), [key]: value } });
  };

  const updateSection = <K extends keyof HomeSection>(i: number, key: K, value: HomeSection[K]) => {
    const copy: HomeFile = { ...current, sections: [...current.sections] };
    copy.sections[i] = { ...copy.sections[i], [key]: value } as HomeSection;
    setCurrent(copy);
  };

  const updateCTA = (i: number, key: keyof CTA, value: string) => {
    const cta: CTA = { label: "", href: "", ...(current.sections[i].cta || {}) };
    const next = { ...cta, [key]: value };
    updateSection(i, "cta", next);
  };

  const move = (from: number, to: number) => {
    const copy: HomeFile = { ...current, sections: [...current.sections] };
    if (to < 0 || to >= copy.sections.length) return;
    const [sp] = copy.sections.splice(from, 1);
    copy.sections.splice(to, 0, sp);
    setCurrent(copy);
  };

  const add = () => {
    const copy: HomeFile = {
      ...current,
      sections: [...current.sections, { imageUrl: "", title: "", body: "", cta: { label: "", href: "" } }],
    };
    setCurrent(copy);
  };

  const remove = (i: number) => {
    const copy: HomeFile = { ...current, sections: [...current.sections] };
    copy.sections.splice(i, 1);
    setCurrent(copy);
  };

  async function uploadImage(file: File): Promise<string> {
    const key = `images/${Date.now()}_${file.name}`.replace(/\s+/g, "_");
    const { error } = await supabase.storage.from("homepage").upload(key, file, { upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from("homepage").getPublicUrl(key);
    return data.publicUrl;
  }
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
    try {
      setSaving(true);
      const normalized: HomeFile = {
        hero: current.hero || { title: "", subtitle: "" },
        sections: current.sections.map((s) => {
          const out: HomeSection = { imageUrl: s.imageUrl || "", title: s.title || "", body: s.body || "" };
          if (s.cta && (s.cta.label || s.cta.href)) {
            const label = s.cta.label?.trim() || "";
            const href = normalizeHref(s.cta.href || "");
            out.cta = label && href ? { label, href } : undefined;
          }
          if (s.shape && s.shape !== ("auto" as any)) out.shape = s.shape;
          return out;
        }),
      };
      validateHome(normalized);
      const res = await saveJson("home", tab, normalized);
      alert(`Home saved via ${res?.via || "function"}.`);
    } catch (e: any) {
      alert(`Save failed: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const shapeOptions: Array<{ value: "" | "round" | "square" | "blob"; label: string }> = [
    { value: "", label: "Auto" },
    { value: "round", label: "Round" },
    { value: "square", label: "Square" },
    { value: "blob", label: "Blob" },
  ];

  return (
    <div className="space-y-5">
      {/* Locale tabs */}
      <div className="inline-flex rounded-xl border dark:border-neutral-700 overflow-hidden">
        <button className={`px-3 py-1.5 text-sm ${tab === "en" ? "bg-brand text-white" : ""}`} onClick={() => setTab("en")}>EN</button>
        <button className={`px-3 py-1.5 text-sm ${tab === "es" ? "bg-brand text-white" : ""}`} onClick={() => setTab("es")}>ES</button>
      </div>

      {/* Hero */}
      <div className="rounded-2xl border dark:border-neutral-700 p-4">
        <h3 className="font-semibold mb-3">Hero</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm mb-1">Title (H1)</label>
            <input
              className="w-full bg-transparent border-b dark:border-neutral-700"
              value={current.hero?.title || ""}
              onChange={(e) => updateHero("title", e.target.value)}
              placeholder="Hero title"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Subtitle</label>
            <input
              className="w-full bg-transparent border-b dark:border-neutral-700"
              value={current.hero?.subtitle || ""}
              onChange={(e) => updateHero("subtitle", e.target.value)}
              placeholder="Hero subtitle"
            />
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {current.sections.map((s, i) => (
          <div key={i} className="rounded-2xl border dark:border-neutral-700 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-sm mb-1">Image URL</label>
                <input
                  className="w-full bg-transparent border-b dark:border-neutral-700"
                  value={s.imageUrl}
                  onChange={(e) => updateSection(i, "imageUrl", e.target.value)}
                  placeholder="https://…"
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
                <label className="block text-sm mb-1">Upload image</label>
                <input type="file" accept="image/*" onChange={(e) => onPickImage(i, e.target.files?.[0] ?? null)} />
                {uploadingIdx === i && <p className="text-xs mt-1">Uploading…</p>}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm mb-1">Title</label>
                <input
                  className="w-full bg-transparent border-b dark:border-neutral-700"
                  value={s.title}
                  onChange={(e) => updateSection(i, "title", e.target.value)}
                  placeholder="Section title"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Shape</label>
                <select
                  className="w-full bg-transparent border rounded p-2 dark:border-neutral-700"
                  value={s.shape || ""}
                  onChange={(e) =>
                    updateSection(i, "shape", (e.target.value || undefined) as HomeSection["shape"])
                  }
                >
                  {shapeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1">Body</label>
              <textarea
                className="w-full bg-transparent border rounded p-3 min-h-40"
                rows={6}
                value={s.body}
                onChange={(e) => updateSection(i, "body", e.target.value)}
                placeholder="Paragraph…"
              />
            </div>

            {/* CTA */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm mb-1">CTA Label</label>
                <input
                  className="w-full bg-transparent border-b dark:border-neutral-700"
                  value={s.cta?.label || ""}
                  onChange={(e) => updateCTA(i, "label", e.target.value)}
                  placeholder="Get started"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">CTA Link</label>
                <input
                  className="w-full bg-transparent border-b dark:border-neutral-700"
                  value={s.cta?.href || ""}
                  onChange={(e) => updateCTA(i, "href", e.target.value)}
                  onBlur={(e) => updateCTA(i, "href", normalizeHref(e.target.value))}
                  placeholder="/education or https://…"
                />
              </div>
            </div>

            <div className="mt-2 flex gap-2">
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
    </div>
  );
}
