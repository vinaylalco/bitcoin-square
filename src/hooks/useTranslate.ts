import { useCallback, useState } from "react";

export interface TranslateResult {
  translatedText: string;
  detectedLanguage?: string;
  provider?: string;
}

/**
 * Custom hook that wraps the LibreTranslate API and exposes a convenient helper
 * for the UI. The hook tracks loading and error state so components can render
 * the correct feedback while an API request is in flight.
 */
export function useTranslate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the base API URL from environment variables with a sensible default
  // for local development.
  const apiBase = import.meta.env.VITE_TRANSLATE_API_URL ?? "http://localhost:5000";

  /**
   * Translate arbitrary text into the requested target language by delegating
   * to the LibreTranslate backend.
   */
  const translate = useCallback(
    async (text: string, targetLang: string): Promise<TranslateResult> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiBase}/translate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            q: text,
            source: "auto",
            target: targetLang,
            format: "text",
          }),
        });

        if (!response.ok) {
          // Surface a helpful message when the network request fails.
          throw new Error(`Translation request failed with status ${response.status}`);
        }

        const data: {
          translatedText?: string;
          detectedLanguage?:
            | string
            | { language?: string }
            | Array<{ language?: string }>;
          provider?: string;
        } = await response.json();

        if (!data.translatedText) {
          // Guard against unexpected payload shapes from the API.
          throw new Error("The translation service returned an unexpected response.");
        }

        let detectedLanguage: string | undefined;
        const rawDetected = data.detectedLanguage;
        if (typeof rawDetected === "string") {
          detectedLanguage = rawDetected;
        } else if (Array.isArray(rawDetected)) {
          detectedLanguage = rawDetected.find((entry) => entry?.language)?.language;
        } else if (rawDetected && typeof rawDetected === "object") {
          detectedLanguage = rawDetected.language;
        }

        return {
          translatedText: data.translatedText,
          detectedLanguage,
          provider: data.provider,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [apiBase],
  );

  return { translate, loading, error };
}

export type UseTranslateReturn = ReturnType<typeof useTranslate>;
