import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { TopicFile } from "../../components/education/types";
import { useRole } from "../../hooks/useRole";
import { saveJson } from "../../lib/cmsClient";

type Locale = "en" | "es";

async function fetchLessons(lang: Locale): Promise<TopicFile> {
  const { data } = supabase.storage.from("lessons").getPublicUrl(`lessons.${lang}.json`);
  const res = await fetch(data.publicUrl, { cache: "no-store" });
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

function validateLessons(data: unknown): asserts data is TopicFile {
  const ok =
    !!data &&
    Array.isArray((data as any).topics) &&
    (data as any).topics.every(
      (t: any) =>
        t && typeof t.name === "string" && Array.isArray(t.cards) &&
        t.cards.every((c: any) =>
          c && typeof c.id === "string" &&
          typeof c.title === "string" &&
          typeof c.content === "string" &&
          Array.isArray(c.objectives) &&
          typeof c.duration_min === "number" &&
          c.quiz &&
          typeof c.quiz.question === "string"
        )
    );
  if (!ok) throw new Error("Invalid lessons structure");
}

export default function LessonsEditor() {
  const { role, loading: roleLoading } = useRole();
  const [tab, setTab] = useState<Locale>("en");
  const [data, setData] = useState<Record<Locale, TopicFile | null>>({ en: null, es: null });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [en, es] = await Promise.all([fetchLessons("en"), fetchLessons("es")]);
        if (alive) setData({ en, es });
      } catch (e: any) {
        console.error("LessonsEditor fetch error:", e?.message || e);
        setErrorMsg(String(e?.message || e));
      }
    })();
    return () => { alive = false; };
  }, []);

  const current = data[tab];

  if (roleLoading) return <div className="p-4">Checking role…</div>;
  if (role !== "admin") return <div className="p-4 text-brand">403 — Admins only</div>;
  if (!current) return <div className="p-4">{errorMsg ? `Error: ${errorMsg}` : "Loading lessons…"} </div>;

  const updateCard = (
    topicIndex: number,
    cardIndex: number,
    key: keyof (typeof current)["topics"][number]["cards"][number],
    value: any
  ) => {
    const copy = { ...current, topics: [...current.topics] };
    copy.topics[topicIndex] = { ...copy.topics[topicIndex], cards: [...copy.topics[topicIndex].cards] };
    copy.topics[topicIndex].cards[cardIndex] = { ...copy.topics[topicIndex].cards[cardIndex], [key]: value };
    setData((d) => ({ ...d, [tab]: copy }));
  };

  const save = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      validateLessons(current);
      const res = await saveJson("lessons", tab, current);
      console.info("[cms] save result:", res);
      alert(`Lessons saved via ${res?.via || "function"}.`);
    } catch (e: any) {
      console.error("LessonsEditor save error:", e?.message || e);
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

      {/* Lesson Editor */}
      <div className="space-y-6">
        {current.topics.map((topic, ti) => (
          <div key={ti} className="rounded-xl border dark:border-neutral-700 p-4 space-y-4">
            <h2 className="text-lg font-bold">{topic.name}</h2>
            {topic.cards.map((card, ci) => (
              <div key={ci} className="rounded border p-3 space-y-3">
                <input
                  className="w-full bg-transparent border-b"
                  placeholder="Title"
                  value={card.title}
                  onChange={(e) => updateCard(ti, ci, "title", e.target.value)}
                />
                <textarea
                  className="w-full bg-transparent border rounded p-3 min-h-40"
                  rows={6}
                  placeholder="Content"
                  value={card.content}
                  onChange={(e) => updateCard(ti, ci, "content", e.target.value)}
                />
                <textarea
                  className="w-full bg-transparent border rounded p-3 min-h-40"
                  rows={4}
                  placeholder="Learning Objectives (comma separated)"
                  value={card.objectives.join(", ")}
                  onChange={(e) =>
                    updateCard(ti, ci, "objectives", e.target.value.split(",").map((s) => s.trim()))
                  }
                />
                <input
                  className="w-full bg-transparent border-b"
                  placeholder="Quiz Question"
                  value={card.quiz.question}
                  onChange={(e) => updateCard(ti, ci, "quiz", { ...card.quiz, question: e.target.value })}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Save Button */}
      <div className="flex gap-2">
        <button
          className="px-4 py-2 rounded-lg border dark:border-neutral-700 bg-brand text-white"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save EN/ES Current Tab"}
        </button>
      </div>

      {errorMsg && <p className="text-sm text-brand/90">{errorMsg}</p>}
    </div>
  );
}
