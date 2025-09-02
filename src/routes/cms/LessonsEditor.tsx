import React, { useState } from "react";
import type { TopicFile } from "../../components/education/types";
import { saveJson } from "../../lib/cmsClient";

type Locale = "en" | "es";

function validateLessons(data: TopicFile) {
  const ok =
    !!data &&
    Array.isArray(data.topics) &&
    data.topics.every(
      (t) =>
        t &&
        typeof t.name === "string" &&
        Array.isArray(t.cards) &&
        t.cards.every(
          (c) =>
            c &&
            typeof c.id === "string" &&
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

export default function LessonsEditor({
  initial,
}: {
  initial: { en: TopicFile; es: TopicFile };
}) {
  const [tab, setTab] = useState<Locale>("en");
  const [data, setData] = useState<Record<Locale, TopicFile>>({
    en: initial.en,
    es: initial.es,
  });
  const [saving, setSaving] = useState(false);

  const current = data[tab];

  const updateCard = (
    ti: number,
    ci: number,
    key: keyof (typeof current)["topics"][number]["cards"][number],
    value: any
  ) => {
    const copy = { ...current, topics: [...current.topics] };
    copy.topics[ti] = { ...copy.topics[ti], cards: [...copy.topics[ti].cards] };
    copy.topics[ti].cards[ci] = { ...copy.topics[ti].cards[ci], [key]: value };
    setData((d) => ({ ...d, [tab]: copy }));
  };

  const save = async () => {
    setSaving(true);
    try {
      validateLessons(current);
      const res = await saveJson("lessons", tab, current);
      alert(`Lessons saved via ${res?.via || "function"}.`);
    } catch (e: any) {
      alert(`Save failed: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Locale tabs */}
      <div className="inline-flex rounded-xl border dark:border-neutral-700 overflow-hidden">
        <button className={`px-3 py-1.5 text-sm ${tab === "en" ? "bg-brand text-white" : ""}`} onClick={() => setTab("en")}>EN</button>
        <button className={`px-3 py-1.5 text-sm ${tab === "es" ? "bg-brand text-white" : ""}`} onClick={() => setTab("es")}>ES</button>
      </div>

      {/* Editor */}
      <div className="space-y-6">
        {current.topics.map((topic, ti) => (
          <div key={ti} className="rounded-xl border dark:border-neutral-700 p-4 space-y-3">
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

      {/* Save */}
      <div className="flex gap-2">
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
