import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { TopicFile } from "../../components/education/types";
import { useRole } from "../../hooks/userole";

type Locale = "en" | "es";

async function fetchLessons(lang: Locale): Promise<TopicFile> {
  const { data } = supabase.storage
    .from("lessons")
    .getPublicUrl(`lessons.${lang}.json`);
  const res = await fetch(data.publicUrl, { cache: "no-store" });
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

async function saveLessons(lang: Locale, content: TopicFile) {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cms_replace_file`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type: "lessons", locale: lang, content }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function LessonsEditor() {
  const { role, loading: roleLoading } = useRole();
  const [tab, setTab] = useState<Locale>("en");
  const [data, setData] = useState<Record<Locale, TopicFile | null>>({
    en: null,
    es: null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [en, es] = await Promise.all([
        fetchLessons("en"),
        fetchLessons("es"),
      ]);
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
  if (!current) return <div className="p-4">Loading lessons…</div>;

  const updateCard = (
    topicIndex: number,
    cardIndex: number,
    key: keyof (typeof current)["topics"][number]["cards"][number],
    value: any
  ) => {
    const copy = {
      ...current,
      topics: [...current.topics],
    };
    copy.topics[topicIndex] = {
      ...copy.topics[topicIndex],
      cards: [...copy.topics[topicIndex].cards],
    };
    copy.topics[topicIndex].cards[cardIndex] = {
      ...copy.topics[topicIndex].cards[cardIndex],
      [key]: value,
    };
    setData((d) => ({ ...d, [tab]: copy }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveLessons(tab, current);
      alert("Lessons saved.");
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

      {/* Lesson Editor */}
      <div className="space-y-6">
        {current.topics.map((topic, ti) => (
          <div
            key={ti}
            className="rounded-xl border dark:border-neutral-700 p-4 space-y-4"
          >
            <h2 className="text-lg font-bold">{topic.name}</h2>
            {topic.cards.map((card, ci) => (
              <div key={ci} className="rounded border p-3 space-y-2">
                <input
                  className="w-full bg-transparent border-b"
                  placeholder="Title"
                  value={card.title}
                  onChange={(e) =>
                    updateCard(ti, ci, "title", e.target.value)
                  }
                />
                <textarea
                  className="w-full bg-transparent border rounded p-2"
                  rows={3}
                  placeholder="Content"
                  value={card.content}
                  onChange={(e) =>
                    updateCard(ti, ci, "content", e.target.value)
                  }
                />
                <textarea
                  className="w-full bg-transparent border rounded p-2"
                  rows={2}
                  placeholder="Learning Objectives (comma separated)"
                  value={card.objectives.join(", ")}
                  onChange={(e) =>
                    updateCard(
                      ti,
                      ci,
                      "objectives",
                      e.target.value.split(",").map((s) => s.trim())
                    )
                  }
                />
                <input
                  className="w-full bg-transparent border-b"
                  placeholder="Quiz Question"
                  value={card.quiz.question}
                  onChange={(e) =>
                    updateCard(ti, ci, "quiz", {
                      ...card.quiz,
                      question: e.target.value,
                    })
                  }
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
    </div>
  );
}
