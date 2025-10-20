import { FormEvent, useState } from "react";
import { useTranslate } from "../hooks/useTranslate";

const AVAILABLE_LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
  { value: "zh", label: "Chinese" },
  { value: "hi", label: "Hindi" },
  { value: "ru", label: "Russian" },
];

export function Translator() {
  const [text, setText] = useState("");
  const [targetLang, setTargetLang] = useState("es");
  const [translatedText, setTranslatedText] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const { translate, loading, error } = useTranslate();

  // Submit handler coordinates the translation call and updates UI state when
  // the promise resolves or fails.
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!text.trim()) {
      setTranslatedText("");
      return;
    }

    try {
      const result = await translate(text, targetLang);
      setTranslatedText(result.translatedText);
      setDetectedLanguage(result.detectedLanguage ?? null);
    } catch (err) {
      // Errors are surfaced via the hook's error state, so no-op here.
      setTranslatedText("");
      setDetectedLanguage(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-2xl bg-white/80 p-6 shadow-lg backdrop-blur-sm">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">LibreTranslate UI</h1>
        <p className="text-sm text-slate-600">
          Translate any text instantly using the open-source LibreTranslate service.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Text to translate</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            required
            className="w-full rounded-lg border border-slate-200 bg-white p-3 text-slate-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            placeholder="Type or paste text here..."
          />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex flex-col gap-2 sm:flex-1">
            <span className="text-sm font-medium text-slate-700">Target language</span>
            <select
              value={targetLang}
              onChange={(event) => setTargetLang(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-slate-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            >
              {AVAILABLE_LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-sky-300 sm:mt-7"
          >
            {loading ? "Translating…" : "Translate"}
          </button>
        </div>
      </form>

      <section className="space-y-2" aria-live="polite" aria-busy={loading}>
        <h2 className="text-lg font-semibold text-slate-900">Translated text</h2>
        <div className="min-h-[120px] rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800">
          {error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : translatedText ? (
            <div className="space-y-2">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{translatedText}</p>
              {detectedLanguage && (
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                  {`Detected source language: ${detectedLanguage.toUpperCase()}`}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Your translated text will appear here.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export default Translator;
