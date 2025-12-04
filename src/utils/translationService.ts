interface TranslateTextParams {
  text: string;
  targetLanguage: string;
  signal?: AbortSignal;
}

interface TranslateTextBulkParams {
  id: string;
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
  signal?: AbortSignal;
}

export interface TranslateTextResult {
  text: string;
  detectedLanguage?: string;
  provider?: string;
}

const DEFAULT_ENDPOINT = "/api/translate";

const resolveEndpoint = () =>
  (typeof import.meta !== "undefined" &&
    (import.meta.env?.VITE_TRANSLATE_API_URL || import.meta.env?.VITE_TRANSLATION_API_URL)) ||
  DEFAULT_ENDPOINT;

const resolveBulkEndpoint = (endpoint: string) => {
  if (endpoint.endsWith("/bulk")) {
    return endpoint;
  }
  return `${endpoint.replace(/\/$/, "")}/bulk`;
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
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      const nestedValue = nested.language ?? nested.lang ?? nested.code;
      if (typeof nestedValue === "string" && nestedValue.trim().length > 0) {
        return nestedValue;
      }
    }
    return undefined;
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

  const endpoint = resolveEndpoint();
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
      source: "auto",
      target: targetLanguage,
      format: "text",
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

export const translateTextBulk = async (
  jobs: TranslateTextBulkParams[],
): Promise<Map<string, TranslateTextResult>> => {
  const resultMap = new Map<string, TranslateTextResult>();

  if (jobs.length === 0) {
    return resultMap;
  }

  const endpoint = resolveBulkEndpoint(resolveEndpoint());
  const apiKey =
    typeof import.meta !== "undefined" ? import.meta.env?.VITE_TRANSLATION_API_KEY : undefined;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (typeof apiKey === "string" && apiKey.trim().length > 0) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const body = {
    q: jobs.map((job) => job.text),
    source: jobs[0]?.sourceLanguage ?? "auto",
    target: jobs[0]?.targetLanguage,
    format: "text",
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: jobs[0]?.signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      errorText && errorText.trim().length > 0
        ? errorText
        : `Bulk translation request failed with status ${response.status}`,
    );
  }

  const payload = await response.json().catch((error: unknown) => {
    throw new Error(`Unable to parse bulk translation response: ${String(error)}`);
  });

  const pickTranslationsArray = (value: unknown): unknown[] | null => {
    if (Array.isArray(value)) {
      return value;
    }
    if (!value || typeof value !== "object") {
      return null;
    }
    const record = value as Record<string, unknown>;
    const candidates = [
      record.translations,
      record.results,
      record.items,
      record.data,
      record.payload,
      record.response,
      record.value,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
    return null;
  };

  const translations =
    pickTranslationsArray(payload) ||
    pickTranslationsArray((payload as Record<string, unknown>)?.data) ||
    pickTranslationsArray((payload as Record<string, unknown>)?.result) ||
    pickTranslationsArray((payload as Record<string, unknown>)?.response) ||
    [];

  translations.forEach((entry, index) => {
    const job = jobs[index];
    if (!job) {
      return;
    }

    if (typeof entry === "string") {
      resultMap.set(job.id, { text: entry });
      return;
    }

    const parsed = extractTranslation(entry);
    if (parsed) {
      resultMap.set(job.id, parsed);
      return;
    }

    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const text =
        record.translatedText ?? record.translation ?? record.text ?? record.value ?? record.result;
      if (typeof text === "string") {
        resultMap.set(job.id, { text });
      }
    }
  });

  return resultMap;
};
