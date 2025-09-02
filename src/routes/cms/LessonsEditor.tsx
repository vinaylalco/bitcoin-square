import React, { useState } from "react";
import type { TopicFile } from "../../components/education/types";
import { saveJson } from "../../lib/cmsClient";

type Locale = "en" | "es";

/** Normalize any incoming JSON into a safe TopicFile shape */
function normalizeTopicFile(input: any): TopicFile {
  const topics = Array.isArray(input?.topics) ? input.topics : [];
  // Ensure each topic has a name and cards array
  return {
    topics: topics.map((t: any) => ({
      name: typeof t?.name === "string" ? t.name : "",
      cards: Array.isArray(t?.cards)
        ? t.cards.map((c: any) => ({
            id: typeof c?.id === "string" ? c.id : "",
            title: typeof c?.title === "string" ? c.title : "",
            duration_min: Number.isFinite(c?.duration_min) ? c.duration_min : 1,
            content: typeof c?.content === "string" ? c.content : "",
            objectives: Array.isArray(c?.objectives) ? c.objectives.filter((s: any) => typeof s === "string") : [],
            quiz: {
              question: typeof c?.quiz?.question === "string" ? c.quiz.question : "",
              type:
                c?.quiz?.type === "multiple_choice" ||
                c?.quiz?.type === "reflection" ||
                c?.quiz?.type === "scenario"
                  ? c.quiz.type
                  : "multiple_choice",
              options: Array.isArray(c?.quiz?.options)
                ? c.quiz.options.filter((s: any) => typeof s === "string")
                : [],
              correct_answer: typeof c?.quiz?.correct_answer === "string" ? c.quiz.correct_answer : "",
              style_note: typeof c?.quiz?.style_note === "string" ? c.quiz.style_note : undefined,
            },
          }))
        : [],
    })),
  };
}

function toList(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function LessonsEditor({
  initial,
}: {
  // Allow undefined/null to be defensive; we normalize below
  initial: { en?: TopicFile | null; es?: TopicFile | null };
}) {
  const [tab, setTab] = useState<Locale>("en");
  const [data, setData] = useState<Record<Locale, TopicFile>>({
    en: normalizeTopicFile(initial?.en),
    es: normalizeTopicFile(initial?.es),
  });
  const [saving, setSaving] = useState(false);

  const current = data[tab]; // always normalized

  const setCurrent = (next: TopicFile) =>
    setData((d) => ({
      ...d,
      [tab]: normalizeTopicFile(next),
    }));

  const addTopic = () => {
    const copy = normalizeTopicFile(current);
    copy.topics.push({ name: "New Topic", cards: [] });
    setCurrent(copy);
  };

  const updateTopicName = (ti: number, name: string) => {
    const copy = normalizeTopicFile(current);
    if (!copy.topics[ti]) return;
    copy.topics[ti].name = name;
    setCurrent(copy);
  };

  const removeTopic = (ti: number) => {
    const copy = normalizeTopicFile(current);
    copy.topics.splice(ti, 1);
    setCurrent(copy);
  };

  const addCard = (ti: number) => {
    const copy = normalizeTopicFile(current);
    if (!copy.topics[ti]) return;
    const nextIndex = copy.topics[ti].cards.length + 1;
    copy.topics[ti].cards.push({
      id: `${ti + 1}-${nextIndex}`,
      title: "New Lesson",
      duration_min: 3,
      content: "",
      objectives: [],
      quiz: { question: "", type: "multiple_choice", options: [], correct_answer: "" },
    });
    setCurrent(copy);
  };

  const removeCard = (ti: number, ci: number) => {
    const copy = normalizeTopicFile(current);
    if (!copy.topics[ti]) return;
    copy.topics[ti].cards.splice(ci, 1);
    setCurrent(copy);
  };

  const updateCard = (
    ti: number,
    ci: number,
    key: keyof (typeof current)["topics"][number]["cards"][number],
    value: any
  ) => {
    const copy = normalizeTopicFile(current);
    if (!copy.topics[ti] || !copy.topics[ti].cards[ci]) return;
    (copy.topics[ti].cards[ci] as any)[key] = value;
    setCurrent(copy);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Normalize one last time before saving
      const payload = normalizeTopicFile(current);
      // Basic guard
      if (!Array.isArray(payload.topics)) throw new Error("Invalid structure: topics not array");
      const res = await saveJson("lessons", tab, payload);
      alert(`Lessons saved via ${res?.via || "function"}.`);
    } catch (e: any) {
      alert(`Save failed: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const EmptyState = (
    <div className="p-6 rounded-xl border dark:border-neutral-700 bg-white dark:bg-neutral-900 text-center">
      <p className="mb-3 font-medium">No topics found.</p>
      <button className="px-3 py-1.5 rounded-lg border dark:border-neutral-700" onClick={addTopic}>
        + Add your first topic
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Locale tabs */}
      <div className="inline-flex rounded-xl border dark:border-neutral-700 overflow-hidden">
        <button
          className={`px-3 py-1.5 text-sm ${tab === "en" ? "bg-brand text-white" : ""}`}
          onClick={() => setTab("en")}
        >
          EN
        </button>
        <button
          className={`px-3 py-1.5 text-sm ${tab === "es" ? "bg-brand text-white" : ""}`}
          onClick={() => setTab("es")}
        >
          ES
        </button>
      </div>

      {/* Topics list */}
      {current.topics.length === 0 ? (
        EmptyState
      ) : (
        <div className="space-y-6">
          {current.topics.map((topic, ti) => (
            <div key={ti} className="rounded-xl border dark:border-neutral-700 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 bg-transparent border-b dark:border-neutral-700"
                  placeholder="Topic name"
                  value={topic.name}
                  onChange={(e) => updateTopicName(ti, e.target.value)}
                />
                <button className="px-2 py-1 border rounded" onClick={() => removeTopic(ti)}>
                  Delete topic
                </button>
                <button className="px-2 py-1 border rounded" onClick={() => addCard(ti)}>
                  + Add card
                </button>
              </div>

              {topic.cards.length === 0 ? (
                <div className="rounded border dark:border-neutral-700 p-3 text-sm opacity-80">
                  No cards. Click “+ Add card”.
                </div>
              ) : (
                topic.cards.map((card, ci) => (
                  <div key={ci} className="rounded border dark:border-neutral-700 p-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <input
                        className="w-full bg-transparent border-b"
                        placeholder="ID (e.g., 1-1)"
                        value={card.id}
                        onChange={(e) => updateCard(ti, ci, "id", e.target.value)}
                      />
                      <input
                        className="w-full bg-transparent border-b"
                        placeholder="Title"
                        value={card.title}
                        onChange={(e) => updateCard(ti, ci, "title", e.target.value)}
                      />
                      <input
                        className="w-full bg-transparent border-b"
                        placeholder="Minutes"
                        type="number"
                        min={1}
                        value={String(card.duration_min ?? 1)}
                        onChange={(e) => updateCard(ti, ci, "duration_min", Number(e.target.value) || 1)}
                      />
                    </div>

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
                      value={(card.objectives ?? []).join(", ")}
                      onChange={(e) => updateCard(ti, ci, "objectives", toList(e.target.value))}
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm mb-1">Quiz Type</label>
                        <select
                          className="w-full bg-transparent border rounded p-2 dark:border-neutral-700"
                          value={card.quiz?.type || "multiple_choice"}
                          onChange={(e) =>
                            updateCard(ti, ci, "quiz", { ...card.quiz, type: e.target.value as any })
                          }
                        >
                          <option value="multiple_choice">multiple_choice</option>
                          <option value="reflection">reflection</option>
                          <option value="scenario">scenario</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Correct Answer</label>
                        <input
                          className="w-full bg-transparent border-b dark:border-neutral-700"
                          placeholder="Correct answer"
                          value={card.quiz?.correct_answer || ""}
                          onChange={(e) =>
                            updateCard(ti, ci, "quiz", { ...card.quiz, correct_answer: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm mb-1">Options (comma separated)</label>
                      <input
                        className="w-full bg-transparent border-b dark:border-neutral-700"
                        placeholder="Option A, Option B, Option C"
                        value={(card.quiz?.options ?? []).join(", ")}
                        onChange={(e) =>
                          updateCard(ti, ci, "quiz", { ...card.quiz, options: toList(e.target.value) })
                        }
                      />
                    </div>

                    <div className="flex gap-2">
                      <button className="px-2 py-1 border rounded" onClick={() => removeCard(ti, ci)}>
                        Delete card
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}

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
