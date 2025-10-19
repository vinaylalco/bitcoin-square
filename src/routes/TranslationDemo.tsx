import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { translateText } from "../api/translateClient";
import { useTranslationPreferences } from "../store/translationPreferences";

interface SampleMessage {
  id: string;
  sender: string;
  text: string;
  originalLang: string;
}

const SAMPLE_MESSAGES: SampleMessage[] = [
  {
    id: "msg-es-1",
    sender: "María",
    text: "¿Podrías compartir el enlace de la reunión de mañana?",
    originalLang: "es",
  },
  {
    id: "msg-id-1",
    sender: "Adi",
    text: "Saya sudah mengunggah laporan terbaru ke drive bersama.",
    originalLang: "id",
  },
  {
    id: "msg-fr-1",
    sender: "Luc",
    text: "La présentation commence dans quinze minutes, ne soyez pas en retard !",
    originalLang: "fr",
  },
];

const AVAILABLE_LANGS = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "id", label: "Indonesian" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
];

type ViewMode = "original" | "translated";

const InstallHint = () => (
  <div className="mb-6 rounded-lg border border-dashed border-brand/40 bg-brand/5 p-4 text-sm text-[var(--fg-muted)]">
    <p className="font-semibold text-[var(--fg-default)]">Install dependencies</p>
    <pre className="mt-2 overflow-x-auto rounded bg-black/80 p-3 text-xs text-white">npm i @tanstack/react-query zustand</pre>
  </div>
);

const PreferencesBar = () => {
  const targetLang = useTranslationPreferences((state) => state.targetLang);
  const setTargetLang = useTranslationPreferences((state) => state.setTargetLang);
  const mode = useTranslationPreferences((state) => state.mode);
  const setMode = useTranslationPreferences((state) => state.setMode);

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <label className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--fg-muted)]">
          Target language
          <select
            className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-base text-[var(--fg-default)] focus:border-brand focus:outline-none sm:mt-0 sm:ml-3 sm:w-48"
            value={targetLang}
            onChange={(event) => setTargetLang(event.target.value)}
          >
            {AVAILABLE_LANGS.map((lang) => (
              <option key={lang.code} value={lang.code} className="bg-[var(--bg-card)] text-[var(--fg-default)]">
                {lang.label} ({lang.code})
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-semibold uppercase tracking-[0.22em] text-[var(--fg-muted)] sm:flex-row sm:items-center">
        Mode
        <select
          className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-base text-[var(--fg-default)] focus:border-brand focus:outline-none sm:ml-3 sm:w-40"
          value={mode}
          onChange={(event) => setMode(event.target.value as "auto" | "off")}
        >
          <option value="auto" className="bg-[var(--bg-card)] text-[var(--fg-default)]">
            Auto
          </option>
          <option value="off" className="bg-[var(--bg-card)] text-[var(--fg-default)]">
            Off
          </option>
        </select>
      </label>
    </div>
  );
};

interface MessageCardProps {
  message: SampleMessage;
}

const MessageCard = ({ message }: MessageCardProps) => {
  const targetLang = useTranslationPreferences((state) => state.targetLang);
  const mode = useTranslationPreferences((state) => state.mode);

  const canTranslate = message.originalLang.toLowerCase() !== targetLang.toLowerCase();
  const shouldAuto = mode === "auto" && canTranslate;

  const [view, setView] = useState<ViewMode>(() => (shouldAuto ? "translated" : "original"));

  useEffect(() => {
    if (shouldAuto) {
      setView("translated");
    } else if (!canTranslate) {
      setView("original");
    }
  }, [shouldAuto, canTranslate, message.id]);

  const queryKey = useMemo(
    () => [
      "translation",
      message.id,
      message.text,
      message.originalLang,
      targetLang.toLowerCase(),
    ],
    [message.id, message.originalLang, message.text, targetLang],
  );

  const shouldRequest = canTranslate && (shouldAuto || view === "translated");

  const { data, error, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      translateText({
        text: message.text,
        sourceLang: message.originalLang,
        targetLang,
      }),
    enabled: shouldRequest,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const toggleView = () => {
    if (!canTranslate) {
      return;
    }
    setView((prev) => (prev === "original" ? "translated" : "original"));
  };

  const showTranslated = view === "translated" && canTranslate;
  const languageLabel = `${message.originalLang} → ${targetLang}`;

  let bodyContent: JSX.Element;

  if (showTranslated) {
    if (isFetching) {
      bodyContent = <p className="text-sm text-[var(--fg-muted)]">Translating…</p>;
    } else if (error instanceof Error) {
      bodyContent = (
        <p className="text-sm text-red-500">
          Unable to translate right now: {error.message}
        </p>
      );
    } else if (data?.translatedText) {
      bodyContent = <p className="text-lg leading-relaxed text-[var(--fg-default)]">{data.translatedText}</p>;
    } else {
      bodyContent = (
        <p className="text-sm text-[var(--fg-muted)]">
          Translation unavailable. Showing original message instead.
        </p>
      );
    }
  } else {
    bodyContent = <p className="text-lg leading-relaxed text-[var(--fg-default)]">{message.text}</p>;
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">{message.sender}</p>
          <p className="text-sm text-[var(--fg-muted)]">{languageLabel}</p>
        </div>
        <button
          type="button"
          onClick={toggleView}
          disabled={!canTranslate}
          className="rounded-full border border-brand px-4 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-brand transition hover:-translate-y-0.5 hover:bg-brand/10 disabled:cursor-not-allowed disabled:border-[var(--border-subtle)] disabled:text-[var(--fg-muted)]"
        >
          {showTranslated ? "Show original" : "Show translated"}
        </button>
      </header>
      <div>{bodyContent}</div>
      {!canTranslate && (
        <p className="text-xs text-[var(--fg-muted)]">
          This message is already in your target language.
        </p>
      )}
    </article>
  );
};

const TranslationDemo = () => (
  <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
    <InstallHint />
    <h1 className="text-3xl font-black uppercase tracking-[0.32em] text-[var(--fg-default)]">
      Live Message Translation
    </h1>
    <p className="text-base leading-relaxed text-[var(--fg-muted)]">
      Incoming messages are automatically translated using LibreTranslate whenever the original language differs from your preferred target language. Adjust the preferences below to see cached translations in action.
    </p>
    <PreferencesBar />
    <section className="flex flex-col gap-4">
      {SAMPLE_MESSAGES.map((message) => (
        <MessageCard key={message.id} message={message} />
      ))}
    </section>
  </div>
);

export default TranslationDemo;
