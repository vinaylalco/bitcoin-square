export interface LibreTranslateResponse {
  translatedText?: string;
  detectedLanguage?: string;
  error?: string;
}

const buildEndpoint = () => {
  const baseUrl = import.meta.env?.VITE_TRANSLATE_API_URL;
  if (!baseUrl || typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
    throw new Error("LibreTranslate API URL is not configured (missing VITE_TRANSLATE_API_URL).");
  }

  return `${baseUrl.replace(/\/$/, "")}/translate`;
};

export const translateText = async (
  text: string,
  targetLang: string,
): Promise<string> => {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return "";
  }

  try {
    const endpoint = buildEndpoint();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: trimmedText,
        source: "auto",
        target: targetLang,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const message =
        errorBody && errorBody.trim().length > 0
          ? `LibreTranslate request failed: ${errorBody}`
          : `LibreTranslate request failed with status ${response.status}`;
      throw new Error(message);
    }

    const data: LibreTranslateResponse = await response.json();

    if (!data || typeof data.translatedText !== "string") {
      console.error("Unexpected LibreTranslate response:", data);
      throw new Error("LibreTranslate returned an unexpected response structure.");
    }

    return data.translatedText;
  } catch (error) {
    const err =
      error instanceof Error ? error : new Error(`Unable to translate text: ${String(error)}`);
    console.error("translateText error:", err);
    throw err;
  }
};

export default translateText;
