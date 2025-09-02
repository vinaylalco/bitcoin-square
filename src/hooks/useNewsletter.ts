import { useEffect, useState } from "react";

const KEY = "bsq.newsletter.v1";

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function save(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export function addSubscriber(email: string) {
  const list = load();
  if (!list.includes(email)) {
    list.push(email);
    save(list);
  }
}

export function getSubscribers(): string[] {
  return load();
}

export function useSubscribers() {
  const [subs, setSubs] = useState<string[]>([]);
  useEffect(() => {
    setSubs(load());
  }, []);
  return subs;
}
