import type { LessonPlan } from "../types/lesson-plan";
import type { Product } from "../types/product";

// Support both Node and browser environments. In the browser, Vite exposes env
// variables on `import.meta.env` while in Node tests we rely on `process.env`.
const env = (typeof process !== "undefined" ? process.env : (import.meta as any).env) as {
  [key: string]: string | undefined;
};

// Base API URL for Strapi
const API =
  env.VITE_STRAPI_URL || env.NEXT_PUBLIC_STRAPI_URL || env.VITE_API_URL || "";
const TOKEN = env.STRAPI_TOKEN || env.VITE_STRAPI_TOKEN;

export async function strapiFetch(path: string, init: RequestInit = {}): Promise<any> {
  const url = `${API}${path}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    throw new Error(res.statusText || "Strapi request failed");
  }
  return res.json();
}

function toSlug(title?: string): string {
  return (
    title
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || ""
  );
}

export async function getLessonPlans(locale: string): Promise<LessonPlan[]> {
  const params = new URLSearchParams();
  params.set("filters[locale][$eq]", locale);
  params.append("populate[0]", "coverImage");
  const path = `/api/lesson-plans?${params.toString()}`;
  const json = await strapiFetch(path);

  const entries: any[] = json?.data || [];
  return entries.map((entry) => {
    const module = entry.LessonPlanJSON?.module || {};
    const slug =
      entry.slug ||
      module.id ||
      toSlug(module.name) ||
      toSlug(entry.title) ||
      String(entry.id);

    return {
      id: entry.documentId || entry.id,
      title: entry.title || module.name,
      slug,
      description: entry.description,
      coverImage: resolveMedia(entry.coverImage?.url),
      topics: [],
      locale: entry.locale || locale,
    } as LessonPlan;
  });
}

export async function getLessonPlan(
  locale: string,
  slug: string,
): Promise<LessonPlan> {
  const params = new URLSearchParams();
  params.set("populate", "*");
  const path = `/api/lesson-plans?${params.toString()}`;
  const json = await strapiFetch(path);

  const entries: any[] = json?.data || [];
  const entry = entries.find((e) => {
    const module = e.LessonPlanJSON?.module || {};
    const s =
      e.slug ||
      module.id ||
      toSlug(module.name) ||
      toSlug(e.title) ||
      String(e.id);
    return s === slug;
  });
  if (!entry) {
    throw new Error("Not Found");
  }

  let source = entry;
  if (entry.locale !== locale) {
    const match = entry.localizations?.find((l: any) => l.locale === locale);
    if (match) source = match;
  }

  const baseModule = entry.LessonPlanJSON?.module || { topics: [] };
  const srcJson = source?.LessonPlanJSON || {};
  const module = srcJson.module
    ? srcJson.module
    : { ...baseModule, topics: srcJson.topics || baseModule.topics || [] };

  const lesson: LessonPlan = {
    id: entry.documentId || entry.id,
    title: source?.title || module.name || baseModule.name,
    slug:
      entry.slug ||
      baseModule.id ||
      toSlug(baseModule.name) ||
      String(entry.id),
    description: source?.description ?? entry.description,
    coverImage: resolveMedia(source?.coverImage?.url || entry.coverImage?.url),
    topics: module.topics || [],
    locale: source?.locale || entry.locale || locale,
  };

  return lesson;
}

// --- Products API ---

export function resolveMedia(url?: string): string {
  if (!url) return "";
  return url.startsWith("http") ? url : `${API}${url}`;
}

export function resolveExternal(url?: string): string {
  if (!url) return "";
  return url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `https://${url}`;
}

export async function fetchProducts(
  page = 1,
  pageSize = 12,
): Promise<Product[]> {
  const params = new URLSearchParams();
  params.set("populate", "ProductImages");
  params.set("pagination[page]", String(page));
  params.set("pagination[pageSize]", String(pageSize));
  const json = await strapiFetch(`/api/products?${params.toString()}`);
  return json?.data || [];
}

export async function fetchProduct(documentId: string): Promise<Product | null> {
  try {
    const params = new URLSearchParams();
    params.set("filters[documentId][$eq]", documentId);
    params.set("populate", "ProductImages");
    const json = await strapiFetch(`/api/products?${params.toString()}`);
    return json?.data?.[0] || null;
  } catch (err: any) {
    if ((err as Error).message === "Not Found") return null;
    throw err;
  }
}