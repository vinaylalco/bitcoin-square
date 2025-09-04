import React, { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRole } from "../../hooks/useRole";

async function uploadJson(type: "lessons" | "home", locale: "en" | "es", file: File) {
  const text = await file.text();
  const content = JSON.parse(text);
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cms_replace_file`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, locale, content }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function LessonsUpload() {
  const { role, loading } = useRole();
  const [enFile, setEnFile] = useState<File | null>(null);
  const [esFile, setEsFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  if (role !== "admin") return <div className="p-4 text-brand">403 — Admins only</div>;
  
  const handle = async () => {
    try {
      setBusy(true);
      if (enFile) await uploadJson("lessons", "en", enFile);
      if (esFile) await uploadJson("lessons", "es", esFile);
      alert("Uploaded. Previous files archived.");
    } catch (e: any) {
      alert(`Upload failed: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block mb-1 font-medium">English lessons.json</label>
        <input type="file" accept="application/json" onChange={(e) => setEnFile(e.target.files?.[0] ?? null)} />
      </div>
      <div>
        <label className="block mb-1 font-medium">Spanish lessons.json</label>
        <input type="file" accept="application/json" onChange={(e) => setEsFile(e.target.files?.[0] ?? null)} />
      </div>
      <button className="px-4 py-2 rounded-lg border dark:border-neutral-700 bg-brand text-white" disabled={busy} onClick={handle}>
        {busy ? "Uploading…" : "Upload & Replace (Archive old)"}
      </button>
      <h3>Below is a copy of the prompt to be run in Bitcoin Square Education Bot to produce the lesson content in JSON to be uploaded in the above form.</h3>
      <p>---------prompt starts below this line--------</p>
      <p>You are a Bitcoin tutor and content generator.
       Create <strong>introductory lesson cards</strong> for these 9 topics:</p>
      <ol>
        <li>Cost of living crisis &amp; fiat inflation</li>
        <li>Why you can’t save money in a cost of living crisis</li>
        <li>How hard money fixes fiat inflation</li>
        <li>Bitcoin as hard money</li>
        <li>Bitcoin as a savings mechanism &amp; investment</li>
        <li>Bitcoin &amp; global communities</li>
        <li>Common criticisms of Bitcoin &amp; rebuttals</li>
        <li>Best way to start buying Bitcoin (Dollar Cost Averaging)</li>
        <li>Bitcoin’s performance vs. other assets (real estate, stocks, gold, etc.)</li>
      </ol>

      <p><strong>REQUIREMENTS:</strong></p>
      <ul>
        <li>Each topic must have exactly <strong>3 cards</strong> (27 total - must be 27).</li>
        <li>Each card = 2–4 minutes (100–200 words).</li>
        <li>Content should <strong>blend delivery styles</strong> so it appeals to ISFJ, ESFJ, ISTJ, ESFP simultaneously:
          <ul>
            <li>Include structured explanation.</li>
            <li>Add relatable personal/family examples.</li>
            <li>Use community or social framing.</li>
            <li>Add a simple story or real-life scenario.</li>
          </ul>
        </li>
        <li>Each card must include:
          <ul>
            <li>id</li>
            <li>title</li>
            <li>duration_min</li>
            <li>content</li>
            <li>objectives (1–2 learning goals)</li>
            <li>quiz:
              <ul>
                <li>question (tests recall of the content)</li>
                <li>type (multiple_choice, reflection, scenario)</li>
                <li>options (3–4 if multiple_choice)</li>
                <li>correct_answer</li>
                <li>style_note (short explanation of why this format works for ISFJ, ESFJ, ISTJ, ESFP learners)</li>
              </ul>
            </li>
          </ul>
        </li>
        <li>Output JSON grouped by topic.</li>
      </ul>
    </div>
  );
}
