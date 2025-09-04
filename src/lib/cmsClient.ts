import { supabase } from "./supabase";

type TypeKey = "home" | "lessons";
type Locale = "en" | "es" | "id";

// Feature flags / env
const BASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim(); // e.g. https://abcd.supabase.co
const SAVE_MODE = ((import.meta.env.VITE_CMS_SAVE_MODE || "function") as "function" | "storage");
const FALLBACK_TO_STORAGE = (import.meta.env.VITE_CMS_FALLBACK_STORAGE ?? "true") === "true";

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated (no Supabase session).");
  return token;
}

/**
 * Primary save entrypoint. Prefers Edge Function; falls back to direct Storage
 * if the function is unreachable (network/CORS). You can disable fallback via env.
 */
export async function saveJson(type: TypeKey, locale: Locale, content: unknown) {
  if (SAVE_MODE === "function") {
    try {
      return await saveViaFunction(type, locale, content);
    } catch (err: any) {
      const msg = String(err?.message || err);
      const looksNetwork = /Failed to fetch|NetworkError|TypeError/i.test(msg);
      if (looksNetwork && FALLBACK_TO_STORAGE) {
        console.warn("[cms] Function unreachable → falling back to Storage. Error:", msg);
        return await saveViaStorage(type, locale, content);
      }
      throw err;
    }
  } else {
    return await saveViaStorage(type, locale, content);
  }
}

async function saveViaFunction(type: TypeKey, locale: Locale, content: unknown) {
  if (!BASE_URL) throw new Error("VITE_SUPABASE_URL is missing.");
  const token = await getToken();
  const url = `${BASE_URL}/functions/v1/cms_replace_file`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type, locale, content }),
  });

  // Better diagnostics
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Function error ${res.status} ${res.statusText}`);
  }
  try {
    return await res.json();
  } catch {
    return { ok: true, via: "function" };
  }
}

async function saveViaStorage(type: TypeKey, locale: Locale, content: unknown) {
  const bucket = type === "home" ? "homepage" : "lessons";
  const key = type === "home" ? `home.${locale}.json` : `lessons.${locale}.json`;

  const blob = new Blob([JSON.stringify(content, null, 2)], {
    type: "application/json",
  });

  const { error } = await supabase
    .storage
    .from(bucket)
    .upload(key, blob, { upsert: true, contentType: "application/json" });

  if (error) throw new Error(`Storage save failed: ${error.message}`);

  return { ok: true, via: "storage" };
}
