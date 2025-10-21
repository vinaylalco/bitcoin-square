interface TranslateTextParams {
  text: string;
  targetLanguage: string;
  signal?: AbortSignal;
}

export interface TranslateTextResult {
  text: string;
  detectedLanguage?: string;
  provider?: string;
}

const DEFAULT_ENDPOINT = "/api/translate";

// Keep local LibreTranslate instances routed through the frontend proxy by
// default so that browsers permit requests without extra CORS configuration.
const LOCAL_TRANSLATE_PROXY_ORIGINS = new Set([
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]);

const resolveConfiguredEndpoint = () => {
  const metaEnv = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined;
  const candidate =
    metaEnv?.VITE_TRANSLATION_API_URL ??
    metaEnv?.VITE_TRANSLATE_API_URL ??
    (typeof process !== "undefined"
      ? process.env?.VITE_TRANSLATION_API_URL ?? process.env?.VITE_TRANSLATE_API_URL
      : undefined);

  const trimmed = typeof candidate === "string" ? candidate.trim() : "";
  if (!trimmed) {
    return DEFAULT_ENDPOINT;
  }

  try {
    const parsed = new URL(trimmed);
    if (LOCAL_TRANSLATE_PROXY_ORIGINS.has(parsed.origin) && typeof window !== "undefined") {
      return DEFAULT_ENDPOINT;
    }
    const cleanedPath = parsed.pathname.replace(/\/$/, "");
    const base = `${parsed.origin}${cleanedPath}`;
    if (trimmed.endsWith("/translate") || cleanedPath.endsWith("/translate")) {
      return trimmed;
    }
    return `${base}/translate`;
  } catch {
    const sanitized = trimmed.replace(/\/$/, "");
    if (sanitized.endsWith("/translate")) {
      return sanitized;
    }
    return `${sanitized}/translate`;
  }
};

const extractTranslation = (payload: unknown): TranslateTextResult | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const root = payload as Record<string, unknown>;

  const pickDetectedLanguage = (source: unknown): string | undefined => {
    if (!source || typeof source !== "object") return undefined;
    const map = source as Record<string, unknown>;
    const value =
      map.detectedLanguage ??
      map.detected_language ??
      map.detectedSourceLanguage ??
      map.detected_source_language ??
      map.source_language ??
      map.sourceLanguage;
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  };

  const directText = root.translatedText ?? root.translation ?? root.text;
  if (typeof directText === "string" && directText.trim().length > 0) {
    return {
      text: directText,
      detectedLanguage: pickDetectedLanguage(root),
      provider: typeof root.provider === "string" ? root.provider : undefined,
    };
  }

  const possibleContainers = [root.data, root.result, root.response, root.payload];
  for (const container of possibleContainers) {
    if (!container || typeof container !== "object") continue;
    const containerRecord = container as Record<string, unknown>;
    const nestedDirect =
      containerRecord.translatedText ?? containerRecord.translation ?? containerRecord.text;
    if (typeof nestedDirect === "string" && nestedDirect.trim().length > 0) {
      return {
        text: nestedDirect,
        detectedLanguage: pickDetectedLanguage(containerRecord),
        provider:
          typeof containerRecord.provider === "string" ? containerRecord.provider : undefined,
      };
    }

    const nestedTranslations =
      containerRecord.translations ??
      containerRecord.results ??
      containerRecord.items ??
      containerRecord.data;
    if (Array.isArray(nestedTranslations) && nestedTranslations.length > 0) {
      for (const entry of nestedTranslations) {
        if (!entry || typeof entry !== "object") continue;
        const entryRecord = entry as Record<string, unknown>;
        const entryText =
          entryRecord.text ?? entryRecord.translatedText ?? entryRecord.translation;
        if (typeof entryText === "string" && entryText.trim().length > 0) {
          return {
            text: entryText,
            detectedLanguage: pickDetectedLanguage(entryRecord),
            provider:
              typeof entryRecord.provider === "string" ? entryRecord.provider : undefined,
          };
        }
      }
    }
  }

  return null;
};

export const translateText = async ({
  text,
  targetLanguage,
  signal,
}: TranslateTextParams): Promise<TranslateTextResult> => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { text: "" };
  }

  const endpoint = resolveConfiguredEndpoint();
  const apiKey =
    typeof import.meta !== "undefined" ? import.meta.env?.VITE_TRANSLATION_API_KEY : undefined;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (typeof apiKey === "string" && apiKey.trim().length > 0) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      q: trimmed,
      target: targetLanguage,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      errorText && errorText.trim().length > 0
        ? errorText
        : `Translation request failed with status ${response.status}`,
    );
  }

  const payload = await response.json().catch((error: unknown) => {
    throw new Error(`Unable to parse translation response: ${String(error)}`);
  });

  const result = extractTranslation(payload);
  if (!result) {
    throw new Error("Translation service returned an unexpected response structure.");
  }

  return result;
};
