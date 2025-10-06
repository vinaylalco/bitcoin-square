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

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  return undefined;
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
    const slug =
      entry.slug ||
      toSlug(title) ||
      (course.id != null ? String(course.id) : undefined) ||
      String(entry.id);
    const price =
      parseNumber(entry.price ?? course.price) ??
      parseNumber(entry.Price ?? entry.price_usd);
    const stripePriceId =
      entry.stripePriceId || entry.stripe_price_id || course.stripePriceId;
    const stripeProductId =
      entry.stripeProductId || entry.stripe_product_id || course.stripeProductId;
    const isPaid =
      coerceBoolean(entry.isPaid ?? entry.is_paid ?? course.isPaid) ?? false;
    return {
      id: entry.id,
      documentId: entry.documentId,
      title,
      slug,
      description: entry.description,
      coverImage: resolveMedia(entry.coverImage?.url),
      modules: course.modules || [],
      locale: entry.locale || locale,
      price,
      stripePriceId,
      stripeProductId,
      isPaid,
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
    (entry.LessonPlanJSON?.course?.id != null
      ? String(entry.LessonPlanJSON?.course?.id)
      : undefined) ||
    toSlug(entry.LessonPlanJSON?.course?.name) ||
    toSlug(entry.title) ||
    String(entry.id);
  lesson.description = source?.description;
  lesson.coverImage = resolveMedia(source?.coverImage?.url);
  lesson.id = entry.id;
  lesson.documentId = entry.documentId;
  lesson.price =
    parseNumber(source?.price ?? entry.price ?? course.price) ??
    parseNumber(entry.Price ?? entry.price_usd);
  lesson.stripePriceId =
    source?.stripePriceId ||
    source?.stripe_price_id ||
    entry.stripePriceId ||
    entry.stripe_price_id ||
    course.stripePriceId;
  lesson.stripeProductId =
    source?.stripeProductId ||
    source?.stripe_product_id ||
    entry.stripeProductId ||
    entry.stripe_product_id ||
    course.stripeProductId;
  lesson.isPaid =
    coerceBoolean(
      source?.isPaid ??
        source?.is_paid ??
        entry.isPaid ??
        entry.is_paid ??
        course.isPaid,
    ) ?? false;
  return lesson;
}

export async function createLessonPlanCheckoutSession(
  lessonPlanId: number,
  priceId: string,
): Promise<{ id: string }> {
  if (!Number.isFinite(lessonPlanId)) {
    throw new Error("Missing lesson plan identifier");
  }

  if (!priceId) {
    throw new Error("Missing Stripe price identifier");
  }

  const path = `/api/lesson-plans/${lessonPlanId}/create-checkout-session`;
  const response = await strapiFetch(path, {
    method: "POST",
    body: JSON.stringify({ priceId }),
  });

  if (!response || typeof response.id !== "string") {
    throw new Error("Unexpected Stripe checkout session response");
  }

  return response;
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