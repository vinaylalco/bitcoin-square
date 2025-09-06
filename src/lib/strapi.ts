import type { LessonPlan } from "../types/lesson-plan";

// Support both Node and browser environments. In the browser, Vite exposes env
// variables on `import.meta.env` while in Node tests we rely on `process.env`.
const env = (typeof process !== "undefined" ? process.env : (import.meta as any).env) as {
  [key: string]: string | undefined;
};

const BASE_URL = env.NEXT_PUBLIC_STRAPI_URL || env.VITE_STRAPI_URL || "";
const TOKEN = env.STRAPI_TOKEN || env.VITE_STRAPI_TOKEN;

export async function strapiFetch(path: string, init: RequestInit = {}): Promise<any> {
  const url = `${BASE_URL}${path}`;
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

export async function getLessonPlan(
  locale: string,
  slug = "education",
): Promise<LessonPlan> {
  // Strapi v5 returns the base locale entry with all localizations nested
  // under a `localizations` array. We fetch all locales at once and then
  // select the requested one on the client.
  const params = new URLSearchParams();
  // Using `populate=*` ensures Strapi returns all nested relations,
  // including the `localizations` array with `LessonPlanJSON` content.
  params.set("populate", "*");
  const path = `/api/lesson-plans?${params.toString()}`;
  const json = await strapiFetch(path);

  // Find the requested lesson plan (currently only one supported)
  const entry = json?.data?.[0];
  if (!entry) {
    return { topics: [], locale };
  }

  // Select the localization matching the requested locale if available
  let source = entry;
  if (entry.locale !== locale) {
    const match = entry.localizations?.find((l: any) => l.locale === locale);
    if (match) {
      source = match;
    }
  }

  const lesson: LessonPlan = source?.LessonPlanJSON || { topics: [] };
  lesson.locale = source?.locale || locale;
  return lesson;
}