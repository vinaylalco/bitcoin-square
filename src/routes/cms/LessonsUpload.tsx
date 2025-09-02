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
    </div>
  );
}
