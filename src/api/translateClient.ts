export interface TranslateRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
}

export interface TranslateResponse {
  translatedText: string;
}

export async function translateText({ text, sourceLang, targetLang }: TranslateRequest): Promise<TranslateResponse> {
  const response = await fetch("https://libretranslate.com/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: sourceLang,
      target: targetLang,
      format: "text",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Translation request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { translatedText?: string };

  if (!data.translatedText) {
    throw new Error("Translation response missing translatedText");
  }

  return { translatedText: data.translatedText };
}
