import React, { useState, useEffect } from "react";
import type { ContactContent } from "../../hooks/useContactContent";
import { getContactContent, setContactContent } from "../../hooks/useContactContent";
import RichTextEditor from "../../components/RichTextEditor";

export default function ContactEditor() {
  const [content, setContent] = useState<ContactContent>(getContactContent());
  const [socialText, setSocialText] = useState<string>("");

  useEffect(() => {
    setSocialText(content.socials.map((s) => `${s.label}|${s.url}`).join("\n"));
  }, []);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const socials = socialText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, url] = line.split("|").map((s) => s.trim());
        return { label, url };
      });
    const updated: ContactContent = { ...content, socials };
    setContent(updated);
    setContactContent(updated);
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <RichTextEditor
          value={content.title}
          onChange={(html) => setContent({ ...content, title: html })}
          className="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Body</label>
        <RichTextEditor
          value={content.body}
          onChange={(html) => setContent({ ...content, body: html })}
          className="w-full min-h-[120px] px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Social Links (label|url per line)</label>
        <textarea
          value={socialText}
          onChange={(e) => setSocialText(e.target.value)}
          className="w-full min-h-[120px] px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent"
        />
      </div>
      <button type="submit" className="px-4 py-2 rounded bg-brand text-white text-sm">
        Save
      </button>
    </form>
  );
}
