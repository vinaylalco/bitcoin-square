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

function normalizeLocale(locale?: string | null): "en" | "es" {
  const value = locale?.toLowerCase() ?? "";
  return value.startsWith("es") ? "es" : "en";
}

function flattenEntry(entry: Record<string, any>): Record<string, any> {
  if (!entry || typeof entry !== "object") return entry;
  if ("attributes" in entry && entry.attributes && typeof entry.attributes === "object") {
    const { attributes, ...rest } = entry as unknown as {
      attributes: Record<string, any>;
    } & Record<string, any>;
    return { ...(rest as Record<string, any>), ...attributes };
  }
  return entry;
}

function extractLocalizations(entry: Record<string, any>): Record<string, any>[] {
  const localizations = entry?.localizations;
  if (!localizations) return [];
  if (Array.isArray(localizations)) {
    return localizations.map((loc) => flattenEntry(loc));
  }
  if (Array.isArray(localizations.data)) {
    return localizations.data.map((loc) => flattenEntry(loc));
  }
  return [];
}

function uniqueLocalizations(
  entries: Record<string, any>[],
  excludeId?: number | string,
): Record<string, any>[] {
  const map = new Map<string, Record<string, any>>();
  entries.forEach((item) => {
    const flattened = flattenEntry(item);
    if (!flattened) return;
    if (excludeId != null && flattened.id === excludeId) return;
    const locale = normalizeLocale(flattened.locale);
    const key = `${flattened.documentId ?? ""}:${locale}`;
    if (!map.has(key)) {
      map.set(key, flattened);
    }
  });
  return Array.from(map.values());
}

export function selectLocalizedEntry<T extends Record<string, any>>(
  entry: T,
  locale: string,
  additional: Record<string, any>[] = [],
): T {
  const normalizedTarget = normalizeLocale(locale);
  const flattened = flattenEntry(entry as Record<string, any>);
  const allLocalizations = uniqueLocalizations(
    [...extractLocalizations(flattened), ...additional],
    flattened?.id,
  );
  const baseLocale = normalizeLocale(flattened?.locale);
  const match =
    normalizedTarget !== baseLocale
      ? allLocalizations.find((loc) => normalizeLocale(loc.locale) === normalizedTarget)
      : undefined;
  const merged = match ? { ...flattened, ...match } : flattened;
  return {
    ...(merged as Record<string, any>),
    locale: match?.locale ?? flattened?.locale ?? normalizedTarget,
    localizations: allLocalizations,
  } as T;
}

export async function getLessonPlans(locale: string): Promise<LessonPlan[]> {
  const params = new URLSearchParams();
  params.set("filters[locale][$eq]", locale);
  params.append("populate[0]", "coverImage");
  const path = `/api/lesson-plans?${params.toString()}`;
  const json = await strapiFetch(path);

  const entries: any[] = json?.data || [];
  return entries.map((entry) => {
    const course = entry.LessonPlanJSON?.course || {};
    const title = course.name || entry.title;
    const slug = entry.slug || toSlug(title) || course.id || String(entry.id);
    return {
      id: entry.documentId || entry.id,
      title,
      slug,
      description: entry.description,
      coverImage: resolveMedia(entry.coverImage?.url),
      modules: course.modules || [],
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
      const s =
      e.slug ||
      e.LessonPlanJSON?.course?.id ||
      toSlug(e.LessonPlanJSON?.course?.name) ||
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

  const course = source?.LessonPlanJSON?.course || {};
  const lesson: LessonPlan = {
    modules: course.modules || [],
  } as LessonPlan;
  lesson.locale = source?.locale || locale;
  lesson.title = course.name || source?.title;
  // lesson.slug = entry.slug || toSlug(lesson.title) || course.id || String(entry.id);
  lesson.slug =
    entry.slug ||
    entry.LessonPlanJSON?.course?.id ||
    toSlug(entry.LessonPlanJSON?.course?.name) ||
    toSlug(entry.title) ||
    String(entry.id);
  lesson.description = source?.description;
  lesson.coverImage = resolveMedia(source?.coverImage?.url);
  lesson.id = entry.documentId || entry.id;
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
  locale = "en",
): Promise<Product[]> {
  const params = new URLSearchParams();
  params.append("populate[0]", "ProductImages");
  params.append("populate[1]", "localizations");
  params.append("populate[localizations][populate][0]", "ProductImages");
  params.set("pagination[page]", String(page));
  params.set("pagination[pageSize]", String(pageSize));
  const json = await strapiFetch(`/api/products?${params.toString()}`);
  const entries: any[] = json?.data || [];
  return entries.map((entry) => selectLocalizedEntry(entry, locale));
}

export async function fetchProduct(
  documentId: string,
  locale = "en",
): Promise<Product | null> {
  try {
    const params = new URLSearchParams();
    params.set("filters[documentId][$eq]", documentId);
    params.append("populate[0]", "ProductImages");
    params.append("populate[1]", "localizations");
    params.append("populate[localizations][populate][0]", "ProductImages");
    const json = await strapiFetch(`/api/products?${params.toString()}`);
    const entries: any[] = json?.data || [];
    if (!entries.length) return null;
    const normalized = normalizeLocale(locale);
    const flattenedEntries = entries.map((entry) => flattenEntry(entry));
    const preferred =
      flattenedEntries.find((entry) => normalizeLocale(entry.locale) === normalized) ||
      flattenedEntries[0];
    const remaining = flattenedEntries.filter((entry) => entry !== preferred);
    return selectLocalizedEntry(preferred, normalized, remaining);
  } catch (err: any) {
    if ((err as Error).message === "Not Found") return null;
    throw err;
  }
}