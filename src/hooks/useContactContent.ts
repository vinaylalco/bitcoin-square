import { useEffect, useState } from "react";

export type SocialLink = { label: string; url: string };
export type ContactContent = {
  title: string; // HTML
  body: string; // HTML
  socials: SocialLink[];
};

const KEY = "bsq.contact.v1";

function normalizeContactContent(value: unknown): ContactContent {
  if (!value || typeof value !== "object") {
    return { title: "Contact", body: "", socials: [] };
  }
  const record = value as Partial<ContactContent>;
  const title = typeof record.title === "string" ? record.title : "Contact";
  const body = typeof record.body === "string" ? record.body : "";
  const socials = Array.isArray(record.socials) ? record.socials : [];
  return { title, body, socials };
}

function load(): ContactContent {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      return normalizeContactContent(parsed);
    }
  } catch {}
  return normalizeContactContent(null);
}

function save(c: ContactContent) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {}
}

export function getContactContent(): ContactContent {
  return load();
}

export function setContactContent(c: ContactContent) {
  save(normalizeContactContent(c));
}

export function useContactContent() {
  const [content, setContent] = useState<ContactContent>(() => load());
  useEffect(() => {
    setContent(load());
  }, []);
  const update = (c: ContactContent) => {
    const normalized = normalizeContactContent(c);
    setContent(normalized);
    save(normalized);
  };
  return { content, update };
}
