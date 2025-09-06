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

export async function getLessonPlan(locale: string, slug = "education"): Promise<LessonPlan> {
  const path = `/api/lesson-plans?locale=${locale}&filters[slug][$eq]=${slug}&populate=*`;
  const json = await strapiFetch(path);
  const entry = json?.data?.[0];
  if (!entry && locale !== "en") {
    return getLessonPlan("en", slug);
  }
  const lesson: LessonPlan = entry?.attributes?.LessonPlanJSON || { topics: [] };
  if (entry?.attributes?.locale) {
    lesson.locale = entry.attributes.locale;
  } else {
    lesson.locale = locale;
  }
  return lesson;
}
