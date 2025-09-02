import { useEffect, useState } from "react";

export type SocialLink = { label: string; url: string };
export type ContactContent = {
  title: string;
  body: string; // HTML
  socials: SocialLink[];
};

const KEY = "bsq.contact.v1";

function load(): ContactContent {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ContactContent;
  } catch {}
  return { title: "Contact", body: "", socials: [] };
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
  save(c);
}

export function useContactContent() {
  const [content, setContent] = useState<ContactContent>(() => load());
  useEffect(() => {
    setContent(load());
  }, []);
  const update = (c: ContactContent) => {
    setContent(c);
    save(c);
  };
  return { content, update };
}
