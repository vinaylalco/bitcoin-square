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

function toTrimmedString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value == null) continue;
    const str = toTrimmedString(value);
    if (str) return str;
  }
  return undefined;
}

function pickValue<T>(...values: T[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function parseIsPaid(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value == null) return undefined;
  const normalized = toTrimmedString(value).toLowerCase();
  if (!normalized) return undefined;
  if (["true", "yes", "paid", "1"].includes(normalized)) return true;
  if (["false", "no", "free", "complimentary", "not paid", "0"].includes(normalized)) return false;
  return undefined;
}

function resolveCoursePurchaseUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return resolveExternal(url);
}

function applyCourseMeta(target: LessonPlan, source: any) {
  if (!source || typeof source !== "object") return;
  const price = pickString(
    source.price,
    source.Price,
    source.coursePrice,
    source.CoursePrice,
    source.cost,
    source.Cost,
  );
  const purchaseLabel = pickString(
    source.purchaseLabel,
    source.PurchaseLabel,
    source.buttonLabel,
    source.ButtonLabel,
    source.buyLabel,
    source.BuyLabel,
  );
  const purchaseUrl = pickString(
    source.purchaseUrl,
    source.PurchaseUrl,
    source.buttonLink,
    source.ButtonLink,
    source.buyUrl,
    source.BuyUrl,
    source.buyLink,
    source.BuyLink,
  );
  const isPaidCandidate = pickValue(
    source.isPaid,
    source.ispaid,
    source.IsPaid,
    source.Ispaid,
    source.paymentStatus,
    source.PaymentStatus,
    source.isComplimentary,
    source.IsComplimentary,
  );

  if (price && !target.price) {
    target.price = price;
  }

  if (purchaseLabel && !target.purchaseLabel) {
    target.purchaseLabel = purchaseLabel;
  }

  if (purchaseUrl && !target.purchaseUrl) {
    target.purchaseUrl = resolveCoursePurchaseUrl(purchaseUrl);
  }

  const parsedIsPaid = parseIsPaid(isPaidCandidate);
  if (typeof parsedIsPaid === "boolean" && target.isPaid === undefined) {
    target.isPaid = parsedIsPaid;
  }
}

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
    const course = entry.LessonPlanJSON?.course || {};
    const title = course.name || entry.title;
    const slug = entry.slug || toSlug(title) || course.id || String(entry.id);
    const lessonPlan: LessonPlan = {
      id: entry.documentId || entry.id,
      title,
      slug,
      description: entry.description,
      coverImage: resolveMedia(entry.coverImage?.url),
      modules: course.modules || [],
      locale: entry.locale || locale,
    };

    applyCourseMeta(lessonPlan, entry);
    applyCourseMeta(lessonPlan, course);

    return lessonPlan;
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
  applyCourseMeta(lesson, entry);
  applyCourseMeta(lesson, source);
  applyCourseMeta(lesson, course);
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