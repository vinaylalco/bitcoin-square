import { FormEvent, useState } from "react";
import useTranslation from "../hooks/useTranslation";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
];

const TranslatorDemo = () => {
  const [text, setText] = useState("Hello world");
  const [targetLanguage, setTargetLanguage] = useState("es");
  const { translate, translatedText, loading, error } = useTranslation();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }

    try {
      await translate(text, targetLanguage);
    } catch (err) {
      // Error is handled inside the hook state; this catch prevents unhandled rejections in React 18.
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg">
      <h2 className="text-xl font-semibold">LibreTranslate Demo</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Enter text below, choose a target language, and click translate to see the response from
        your LibreTranslate instance.
      </p>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-medium">Text to translate</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            placeholder="Type something..."
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Target language</span>
          <select
            value={targetLanguage}
            onChange={(event) => setTargetLanguage(event.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="px-4 py-2 rounded bg-brand text-white text-sm disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Translating..." : "Translate"}
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {translatedText && !error && (
        <div className="rounded bg-neutral-100 dark:bg-neutral-800 p-3 text-sm">
          <span className="block font-medium mb-1">Translated text</span>
          <p>{translatedText}</p>
        </div>
      )}
    </div>
  );
};

export default TranslatorDemo;
