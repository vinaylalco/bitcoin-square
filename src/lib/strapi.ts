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
  params.set("populate", "*");
  const path = `/api/lesson-plans?${params.toString()}`;
  const json = await strapiFetch(path);

  const entries: any[] = Array.isArray(json?.data) ? json.data : [];
  return entries.map((entry) => mapLessonPlanEntry(entry, locale));
}

export async function getLessonPlan(
  locale: string,
  slug: string,
): Promise<LessonPlan> {
  const params = new URLSearchParams();
  params.set("populate", "*");
  const path = `/api/lesson-plans?${params.toString()}`;
  const json = await strapiFetch(path);

  const entries: any[] = Array.isArray(json?.data) ? json.data : [];
  const entry = entries.find((candidate) => matchLessonPlanSlug(candidate, slug));
  if (!entry) {
    throw new Error("Not Found");
  }

  return mapLessonPlanEntry(entry, locale, slug);
}

function mapLessonPlanEntry(entry: any, locale: string, requestedSlug?: string): LessonPlan {
  const data = getLessonPlanData(entry);
  const { localeData, localeKey } = selectLessonPlanLocale(data, locale);
  const course = resolveCourse(data, localeData);
  const modules = Array.isArray(course.modules) ? course.modules : [];
  const title = pickFirstNonEmpty(course.name, data.title, entry?.title);
  const slug = pickFirstNonEmpty(
    data.slug,
    entry?.slug,
    requestedSlug,
    course.id,
    toSlug(title),
    data.documentId,
    entry?.documentId,
    data.id,
    entry?.id,
  );
  const description = pickFirstNonEmpty(
    localeData?.description,
    course.description,
    data.description,
    entry?.description,
    typeof data.summary === "string" ? data.summary : undefined,
    typeof entry?.summary === "string" ? entry.summary : undefined,
  );
  const coverImage = extractCoverImage(
    localeData?.coverImage,
    course.coverImage,
    data.coverImage,
    entry?.coverImage,
  );

  return {
    id: data.documentId || entry?.documentId || data.id || entry?.id,
    title,
    slug,
    description,
    coverImage,
    modules,
    locale: localeKey || data.locale || entry?.locale || locale,
  } as LessonPlan;
}

function matchLessonPlanSlug(entry: any, slug: string): boolean {
  if (!entry || !slug) return false;
  const normalized = slug.toLowerCase();
  const candidates = collectLessonPlanSlugCandidates(entry);
  return candidates.some((candidate) => candidate.toLowerCase() === normalized);
}

function collectLessonPlanSlugCandidates(entry: any): string[] {
  const data = getLessonPlanData(entry);
  const result: string[] = [];
  const push = (value: unknown) => {
    if (!value) return;
    const str = String(value).trim();
    if (str) result.push(str);
  };

  push(data.slug);
  push(entry?.slug);
  push(data.documentId);
  push(entry?.documentId);
  push(data.id);
  push(entry?.id);

  const locales = data.locales;
  if (locales && typeof locales === "object") {
    Object.values(locales).forEach((loc: any) => {
      if (!loc || typeof loc !== "object") return;
      const course = resolveCourse(data, loc);
      push(loc.slug);
      push(course?.id);
      push(toSlug(course?.name));
    });
  }

  const legacyCourse = data.lessonPlan?.course || data.LessonPlanJSON?.course;
  if (legacyCourse && typeof legacyCourse === "object") {
    push(legacyCourse.id);
    push(toSlug(legacyCourse.name));
  }

  return result.filter(Boolean);
}

function selectLessonPlanLocale(
  data: any,
  locale: string,
): { localeData?: any; localeKey?: string } {
  const locales = data?.locales;
  if (locales && typeof locales === "object") {
    const requested = (locale || "").toLowerCase();
    const base = requested.split("-")[0];
    const keys = Object.keys(locales);

    const directKey = keys.find((key) => key.toLowerCase() === requested) ??
      keys.find((key) => key.toLowerCase() === base);
    if (directKey) {
      return { localeData: locales[directKey], localeKey: directKey };
    }

    if (locales.en) {
      return { localeData: locales.en, localeKey: "en" };
    }

    if (keys.length > 0) {
      const fallbackKey = keys[0];
      return { localeData: locales[fallbackKey], localeKey: fallbackKey };
    }

    return {};
  }

  const legacyLocale = data?.locale;
  if (legacyLocale && data?.LessonPlanJSON) {
    return { localeData: data.LessonPlanJSON, localeKey: legacyLocale };
  }

  if (data?.LessonPlanJSON) {
    return { localeData: data.LessonPlanJSON };
  }

  return {};
}

function extractCoverImage(...sources: any[]): string {
  for (const source of sources) {
    if (!source) continue;
    if (typeof source === "string") {
      return resolveMedia(source);
    }
    if (typeof source === "object") {
      const url =
        typeof source.url === "string"
          ? source.url
          : typeof source?.data?.attributes?.url === "string"
            ? source.data.attributes.url
            : undefined;
      if (url) {
        return resolveMedia(url);
      }
    }
  }
  return "";
}

function pickFirstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    if (value == null) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return "";
}

function getLessonPlanData(entry: any): any {
  if (!entry || typeof entry !== "object") return {};
  const attrs = entry.attributes;
  if (attrs && typeof attrs === "object") {
    return {
      ...attrs,
      id: attrs.id ?? entry.id,
      documentId: attrs.documentId ?? entry.documentId,
      slug: attrs.slug ?? entry.slug,
    };
  }
  return entry;
}

function resolveCourse(data: any, localeData?: any): any {
  if (localeData && typeof localeData === "object") {
    if (Array.isArray(localeData.modules)) {
      return localeData;
    }
    if (localeData.course && typeof localeData.course === "object") {
      return localeData.course;
    }
  }

  if (data?.course && typeof data.course === "object") {
    return data.course;
  }

  if (data?.lessonPlan?.course && typeof data.lessonPlan.course === "object") {
    return data.lessonPlan.course;
  }

  if (data?.LessonPlanJSON?.course && typeof data.LessonPlanJSON.course === "object") {
    return data.LessonPlanJSON.course;
  }

  return {};
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