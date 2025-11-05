import type { LessonPlan, Module } from "../types/lesson-plan";
import type { Product } from "../types/product";
import {
  resolveLocale,
  normalizeLocale as normalizeAppLocale,
  type AppLocale,
} from "../utils/locale";

// Support both Node and browser environments. In the browser, Vite exposes env
// variables on `import.meta.env` while in Node tests we rely on `process.env`.
const env = (typeof process !== "undefined" ? process.env : (import.meta as any).env) as {
  [key: string]: string | undefined;
};

// Base API URL for Strapi
const API =
  env.VITE_STRAPI_URL || env.NEXT_PUBLIC_STRAPI_URL || env.VITE_API_URL || "";
const TOKEN = env.STRAPI_TOKEN || env.VITE_STRAPI_TOKEN;

type AnyRecord = Record<string, unknown>;

function getFrontendBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return (
    env.VITE_SITE_URL ||
    env.NEXT_PUBLIC_SITE_URL ||
    env.FRONTEND_URL ||
    env.VITE_FRONTEND_URL ||
    ""
  );
}

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

const CHECKOUT_URL_KEYS = [
  "redirectUrl",
  "redirect_url",
  "invoiceUrl",
  "invoice_url",
  "checkoutUrl",
  "checkout_url",
  "paymentUrl",
  "payment_url",
  "url",
  "link",
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isLikelyHttpUrl(value: string): boolean {
  return /^(https?:)?\/\//i.test(value.trim());
}

function resolveCheckoutRedirectUrl(payload: unknown): string | null {
  const queue: unknown[] = [payload];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);

    if (typeof current === "string") {
      const trimmed = current.trim();
      if (trimmed && isLikelyHttpUrl(trimmed)) {
        return trimmed;
      }
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current !== "object") {
      continue;
    }

    const record = current as Record<string, unknown>;
    for (const key of CHECKOUT_URL_KEYS) {
      const candidate = record[key];
      if (isNonEmptyString(candidate) && isLikelyHttpUrl(candidate)) {
        return candidate.trim();
      }
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return null;
}

function unwrapLessonPlanEntry<T extends AnyRecord = AnyRecord>(entry: any): T {
  if (!entry || typeof entry !== "object") {
    return entry as T;
  }

  const attributes = (entry as AnyRecord).attributes;
  if (attributes && typeof attributes === "object") {
    const plain: AnyRecord = { ...(attributes as AnyRecord) };

    if (entry.id !== undefined && plain.id === undefined) {
      plain.id = entry.id;
    }

    if (entry.documentId !== undefined && plain.documentId === undefined) {
      plain.documentId = entry.documentId;
    }

    if (entry.slug !== undefined && plain.slug === undefined) {
      plain.slug = entry.slug;
    }

    const rawLocalizations = (attributes as AnyRecord).localizations;
    if (!plain.localizations && rawLocalizations && typeof rawLocalizations === "object") {
      const data = (rawLocalizations as AnyRecord).data;
      if (Array.isArray(data)) {
        plain.localizations = data;
      }
    }

    return plain as T;
  }

  return entry as T;
}

function getLocalizationEntries(entry: any): AnyRecord[] {
  const raw = (entry as AnyRecord)?.localizations;
  if (Array.isArray(raw)) {
    return raw as AnyRecord[];
  }

  if (raw && typeof raw === "object") {
    const data = (raw as AnyRecord).data;
    if (Array.isArray(data)) {
      return data as AnyRecord[];
    }
  }

  const unwrapped = unwrapLessonPlanEntry(entry);
  const normalized = (unwrapped as AnyRecord)?.localizations;

  if (Array.isArray(normalized)) {
    return normalized as AnyRecord[];
  }

  if (normalized && typeof normalized === "object") {
    const data = (normalized as AnyRecord).data;
    if (Array.isArray(data)) {
      return data as AnyRecord[];
    }
  }

  return [];
}

function selectLocalizedEntry(entry: any, locale: string): AnyRecord {
  const normalizedTarget = normalizeAppLocale(locale);
  const base = unwrapLessonPlanEntry(entry);
  const baseLocale = normalizeAppLocale((base as AnyRecord)?.locale as string | undefined);

  if (!normalizedTarget || baseLocale === normalizedTarget) {
    return base;
  }

  for (const candidate of getLocalizationEntries(entry)) {
    const plainCandidate = unwrapLessonPlanEntry(candidate);
    const candidateLocale = normalizeAppLocale(
      (plainCandidate as AnyRecord)?.locale as string | undefined,
    );

    if (candidateLocale === normalizedTarget) {
      return plainCandidate;
    }
  }

  return base;
}

function extractMediaUrl(value: unknown): string | undefined {
  if (!value) return undefined;

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    const record = value as AnyRecord;
    if (typeof record.url === "string") {
      return record.url;
    }

    if (record.data) {
      const data = record.data as unknown;
      if (Array.isArray(data)) {
        for (const item of data) {
          const resolved = extractMediaUrl(
            typeof item === "object" && item
              ? ((item as AnyRecord).attributes as unknown) ?? item
              : item,
          );
          if (resolved) return resolved;
        }
      } else if (typeof data === "object" && data) {
        const nested = extractMediaUrl(
          ((data as AnyRecord).attributes as unknown) ?? data,
        );
        if (nested) return nested;
      }
    }
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
    const unwrapped = unwrapLessonPlanEntry(entry);
    const course = (unwrapped?.LessonPlanJSON as AnyRecord | undefined)?.course || {};
    const title = course.name || unwrapped?.title;
    const slug =
      unwrapped?.slug ||
      toSlug(title) ||
      (course.id != null ? String(course.id) : undefined) ||
      String(unwrapped?.id ?? entry.id);
    const price =
      parseNumber(unwrapped?.price ?? course.price) ??
      parseNumber(unwrapped?.Price ?? unwrapped?.price_usd);
    const stripePriceId =
      (unwrapped?.stripePriceId as string | undefined) ||
      (unwrapped?.stripe_price_id as string | undefined) ||
      (course.stripePriceId as string | undefined);
    const stripeProductId =
      (unwrapped?.stripeProductId as string | undefined) ||
      (unwrapped?.stripe_product_id as string | undefined) ||
      (course.stripeProductId as string | undefined);
    const isPaid =
      coerceBoolean(
        unwrapped?.isPaid ??
          unwrapped?.is_paid ??
          (course.isPaid as unknown) ??
          (course.is_paid as unknown),
      ) ?? false;
    const coverUrl = extractMediaUrl(unwrapped?.coverImage);
    const modules = Array.isArray(course.modules) ? course.modules : [];
    return {
      id: entry.id,
      documentId: unwrapped?.documentId ?? entry.documentId,
      title,
      slug,
      description: unwrapped?.description,
      coverImage: resolveMedia(coverUrl),
      modules,
      locale: (unwrapped?.locale as string | undefined) || locale,
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
    const unwrapped = unwrapLessonPlanEntry(e);
    const course = (unwrapped?.LessonPlanJSON as AnyRecord | undefined)?.course || {};
    const candidateSlug =
      unwrapped?.slug ||
      (course.id != null ? String(course.id) : undefined) ||
      toSlug(course.name) ||
      toSlug(unwrapped?.title) ||
      String(unwrapped?.id ?? e.id);
    return candidateSlug === slug;
  });
  if (!entry) {
    throw new Error("Not Found");
  }

  const base = unwrapLessonPlanEntry(entry);
  const source = selectLocalizedEntry(entry, locale);
  const baseCourse = (base?.LessonPlanJSON as AnyRecord | undefined)?.course || {};
  const localizedCourse = (source?.LessonPlanJSON as AnyRecord | undefined)?.course || {};
  const mergedCourse: AnyRecord = {
    ...baseCourse,
    ...localizedCourse,
    modules: Array.isArray(localizedCourse.modules)
      ? localizedCourse.modules
      : Array.isArray(baseCourse.modules)
        ? baseCourse.modules
        : [],
  };

  const lesson: LessonPlan = {
    modules: (mergedCourse.modules as Module[]) || [],
  } as LessonPlan;
  lesson.locale = (source?.locale as string | undefined) || (base?.locale as string | undefined) || locale;
  lesson.title = (mergedCourse.name as string | undefined) || (source?.title as string | undefined) || (base?.title as string | undefined);
  // lesson.slug = entry.slug || toSlug(lesson.title) || course.id || String(entry.id);
  lesson.slug =
    (base?.slug as string | undefined) ||
    (baseCourse.id != null ? String(baseCourse.id) : undefined) ||
    toSlug(baseCourse.name) ||
    toSlug(base?.title as string | undefined) ||
    String(base?.id ?? entry.id);
  lesson.description = (source?.description as string | undefined) ?? (base?.description as string | undefined);
  const coverUrl = extractMediaUrl(source?.coverImage ?? base?.coverImage);
  lesson.coverImage = resolveMedia(coverUrl);
  lesson.id = entry.id;
  lesson.documentId = entry.documentId ?? (source?.documentId as string | undefined) ?? (base?.documentId as string | undefined);
  lesson.price =
    parseNumber(
      (source?.price as unknown) ??
        (source?.LessonPlanJSON as AnyRecord | undefined)?.course?.price ??
        (base?.price as unknown) ??
        baseCourse.price,
    ) ?? parseNumber((base?.Price as unknown) ?? (base?.price_usd as unknown));
  lesson.stripePriceId =
    (source?.stripePriceId as string | undefined) ||
    (source?.stripe_price_id as string | undefined) ||
    (base?.stripePriceId as string | undefined) ||
    (base?.stripe_price_id as string | undefined) ||
    (baseCourse.stripePriceId as string | undefined);
  lesson.stripeProductId =
    (source?.stripeProductId as string | undefined) ||
    (source?.stripe_product_id as string | undefined) ||
    (base?.stripeProductId as string | undefined) ||
    (base?.stripe_product_id as string | undefined) ||
    (baseCourse.stripeProductId as string | undefined);
  lesson.isPaid =
    coerceBoolean(
      (source?.isPaid as unknown) ??
        (source?.is_paid as unknown) ??
        (base?.isPaid as unknown) ??
        (base?.is_paid as unknown) ??
        (baseCourse.isPaid as unknown) ??
        (baseCourse.is_paid as unknown),
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
  const frontendBaseUrl = getFrontendBaseUrl();
  const payload: Record<string, unknown> = {
    priceId,
    stripePriceId: priceId,
    // Some Strapi integrations expect the Stripe price identifier on the
    // generic `price` key when constructing Checkout line items. Mirror it so
    // the backend can forward the correct value instead of the numeric price
    // amount, which triggers Stripe errors locally.
    price: priceId,
  };

  if (frontendBaseUrl) {
    const sanitizedBaseUrl = frontendBaseUrl.replace(/\/$/, "");
    payload.successUrl = `${sanitizedBaseUrl}/checkout/success`;
    payload.cancelUrl = `${sanitizedBaseUrl}/checkout/cancel`;
  }

  const response = await strapiFetch(path, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response || typeof response.id !== "string") {
    throw new Error("Unexpected Stripe checkout session response");
  }

  return response;
}

export interface CreateMembershipCheckoutOptions {
  membershipType: "annual" | "lifetime";
  userEmail: string;
  discountCode?: string;
  userId?: number;
}

export interface CreateMembershipCheckoutResponse {
  invoiceUrl?: string;
  message?: string;
}

export async function createMembershipCheckout({
  membershipType,
  userEmail,
  discountCode,
  userId,
}: CreateMembershipCheckoutOptions): Promise<CreateMembershipCheckoutResponse> {
  if (!isNonEmptyString(userEmail)) {
    throw new Error("Missing email address");
  }

  if (membershipType !== "annual" && membershipType !== "lifetime") {
    throw new Error("Invalid membership type");
  }

  const payload: Record<string, unknown> = {
    membershipType,
    userEmail: userEmail.trim(),
  };

  const normalizedUserId = parseNumber(userId);
  if (
    typeof normalizedUserId === "number" &&
    Number.isInteger(normalizedUserId) &&
    normalizedUserId > 0
  ) {
    payload.userId = normalizedUserId;
  }

  if (isNonEmptyString(discountCode)) {
    payload.discountCode = discountCode.trim();
  }

  const response = await strapiFetch("/api/payments/create-session", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const invoiceUrl =
    (typeof response?.invoiceUrl === "string" && response.invoiceUrl.trim()) ||
    resolveCheckoutRedirectUrl(response);

  const message =
    typeof response?.message === "string" && response.message.trim()
      ? response.message.trim()
      : undefined;

  if (!invoiceUrl && !message) {
    throw new Error("Missing membership checkout response");
  }

  const sanitizedResponse: CreateMembershipCheckoutResponse = {};
  if (invoiceUrl) {
    sanitizedResponse.invoiceUrl = invoiceUrl;
  }

  if (message) {
    sanitizedResponse.message = message;
  }

  return sanitizedResponse;
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

export interface FetchProductsOptions {
  page?: number;
  pageSize?: number;
  locale?: AppLocale | string | null;
}

export async function fetchProducts(options: FetchProductsOptions = {}): Promise<Product[]> {
  const { page = 1, pageSize = 12, locale } = options;
  const params = new URLSearchParams();
  params.set("populate", "ProductImages");
  params.set("pagination[page]", String(page));
  params.set("pagination[pageSize]", String(pageSize));
  params.set("locale", resolveLocale(locale));
  const json = await strapiFetch(`/api/products?${params.toString()}`);
  return json?.data || [];
}

export async function fetchProduct(
  documentId: string,
  locale?: AppLocale | string | null,
): Promise<Product | null> {
  try {
    const params = new URLSearchParams();
    params.set("filters[documentId][$eq]", documentId);
    params.set("populate", "ProductImages");
    params.set("locale", resolveLocale(locale));
    const json = await strapiFetch(`/api/products?${params.toString()}`);
    return json?.data?.[0] || null;
  } catch (err: any) {
    if ((err as Error).message === "Not Found") return null;
    throw err;
  }
}