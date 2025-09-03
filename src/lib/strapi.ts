import type { HomeFile } from "../hooks/useHomeContent";
import type { BlogPost } from "../hooks/useBlogPosts";
import type { ContactContent } from "../hooks/useContactContent";
import type { LessonCardData } from "../components/education/types";

const API_URL = (import.meta.env.VITE_STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
const TOKEN_KEY = "bsq.jwt";
let userCache: any | null = null;
const listeners = new Set<(u: any | null) => void>();

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function notify() {
  listeners.forEach((l) => l(userCache));
}

export function onAuthStateChange(cb: (u: any | null) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

async function strapiFetch(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = { ...(opts.headers as any) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/api${path}`, { ...opts, headers });
  if (!res.ok) {
    throw new Error(`Strapi ${opts.method || "GET"} ${path} failed: ${res.status}`);
  }
  return res.json();
}

// Auth ------------------------------------------------------------
export async function login(identifier: string, password: string) {
  const json = await strapiFetch("/auth/local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const { jwt, user } = json;
  setToken(jwt);
  userCache = user;
  notify();
  return user;
}

export async function register(username: string, email: string, password: string) {
  const json = await strapiFetch("/auth/local/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  const { jwt, user } = json;
  setToken(jwt);
  userCache = user;
  notify();
  return user;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  userCache = null;
  notify();
}

export async function getCurrentUser() {
  if (userCache) return userCache;
  const token = getToken();
  if (!token) return null;
  const json = await strapiFetch("/users/me");
  userCache = json;
  return json;
}

// Content ---------------------------------------------------------
export async function fetchHomeContent(locale: "en" | "es"): Promise<HomeFile> {
  const qs = new URLSearchParams({ locale, populate: "deep" });
  const json = await strapiFetch(`/home?${qs.toString()}`);
  const attrs = json.data?.attributes || {};
  return {
    hero: attrs.hero || undefined,
    sections: attrs.sections || [],
  };
}

export async function fetchBlogPosts(locale: "en" | "es"): Promise<BlogPost[]> {
  const qs = new URLSearchParams({ locale, populate: "*" });
  const json = await strapiFetch(`/blog-posts?${qs.toString()}`);
  return (json.data || []).map((d: any) => ({
    id: String(d.id),
    title: d.attributes.title,
    content: d.attributes.content,
  }));
}

export async function fetchContactContent(locale: "en" | "es"): Promise<ContactContent> {
  const qs = new URLSearchParams({ locale, populate: "*" });
  const json = await strapiFetch(`/contact?${qs.toString()}`);
  const attrs = json.data?.attributes || {};
  return {
    title: attrs.title || "",
    body: attrs.body || "",
    socials: attrs.socials || [],
  };
}

export async function fetchLessons(locale: "en" | "es"): Promise<LessonCardData[]> {
  const qs = new URLSearchParams({ locale, populate: "deep" });
  const json = await strapiFetch(`/lessons?${qs.toString()}`);
  const topics = json.data?.attributes?.topics || [];
  return topics.flatMap((t: any) =>
    (t.cards || []).map((c: any) => ({ ...c, topicName: t.name }))
  );
}

export async function subscribeNewsletter(email: string) {
  await strapiFetch(`/newsletters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email } }),
  });
}

export async function fetchSubscribers(): Promise<string[]> {
  const json = await strapiFetch(`/newsletters`);
  return (json.data || []).map((d: any) => d.attributes.email);
}
