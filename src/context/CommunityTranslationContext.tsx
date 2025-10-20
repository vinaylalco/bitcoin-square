import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useTranslate } from "../hooks/useTranslate";

type TranslationStatus = "idle" | "loading" | "ready" | "error";

export interface TranslationEntry {
  status: TranslationStatus;
  originalText: string;
  translatedText?: string;
  detectedLanguage?: string;
  provider?: string;
  error?: string;
}

interface RequestOptions {
  force?: boolean;
}

const LANGUAGE_LABELS: Record<string, string> = {
  ar: "Arabic",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
};

const AUTO_TRANSLATE_STORAGE_KEY = "community-auto-translate";

const normalizeLanguageCode = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  const [primary] = trimmed.split(/[-_]/);
  return (primary ?? trimmed) || undefined;
};

export interface CommunityTranslationContextValue {
  /**
   * Indicates whether dynamic community message translation is currently supported.
   * When false, translation-related UI should remain hidden.
   */
  isSupported: boolean;
  autoTranslateEnabled: boolean;
  setAutoTranslateEnabled: (value: boolean) => void;
  ensureTranslation: (key: string, text: string, options?: RequestOptions) => void;
  refreshTranslation: (key: string, text: string) => void;
  getTranslation: (key: string) => TranslationEntry | undefined;
  isOriginalVisible: (key: string) => boolean;
  toggleOriginal: (key: string) => void;
  targetLanguage: string;
  targetLanguageLabel: string;
  formatLanguageName: (code?: string | null) => string;
}

const noop = () => undefined;

const defaultContextValue: CommunityTranslationContextValue = {
  isSupported: false,
  autoTranslateEnabled: false,
  setAutoTranslateEnabled: noop,
  ensureTranslation: noop,
  refreshTranslation: noop,
  getTranslation: () => undefined,
  isOriginalVisible: () => true,
  toggleOriginal: noop,
  targetLanguage: "en",
  targetLanguageLabel: "English",
  formatLanguageName: (code?: string | null) => (code ? code.toString() : ""),
};

const CommunityTranslationContext = createContext<CommunityTranslationContextValue>(
  defaultContextValue,
);

export const CommunityTranslationProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { translate } = useTranslate();

  const translationSupported = typeof fetch === "function";

  const [entries, setEntries] = useState<Record<string, TranslationEntry>>({});
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({});
  const visibilityMapRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    visibilityMapRef.current = visibilityMap;
  }, [visibilityMap]);

  const [autoTranslateEnabled, setAutoTranslateEnabledState] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(AUTO_TRANSLATE_STORAGE_KEY);
    if (stored === null) {
      return true;
    }
    return stored === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      AUTO_TRANSLATE_STORAGE_KEY,
      autoTranslateEnabled ? "true" : "false",
    );
  }, [autoTranslateEnabled]);

  const targetLanguage = useMemo(() => {
    if (typeof navigator === "undefined" || !navigator.language) {
      return "en";
    }
    const normalized = normalizeLanguageCode(navigator.language);
    if (!normalized) {
      return "en";
    }
    if (LANGUAGE_LABELS[normalized]) {
      return normalized;
    }
    return "en";
  }, []);

  const targetLanguageLabel = useMemo(() => {
    const normalized = normalizeLanguageCode(targetLanguage);
    if (!normalized) return "";
    return LANGUAGE_LABELS[normalized] ?? normalized.toUpperCase();
  }, [targetLanguage]);

  const pendingRequestsRef = useRef<Record<string, Promise<void>>>({});

  const setAutoTranslateEnabled = useCallback((value: boolean) => {
    setAutoTranslateEnabledState(value);
  }, []);

  const getTranslation = useCallback(
    (key: string) => entries[key],
    [entries],
  );

  const isOriginalVisible = useCallback(
    (key: string) => {
      const record = visibilityMapRef.current[key];
      if (typeof record === "boolean") {
        return record;
      }
      return true;
    },
    [],
  );

  const toggleOriginal = useCallback((key: string) => {
    setVisibilityMap((previous) => {
      const next = { ...previous };
      const current = previous[key] ?? true;
      next[key] = !current;
      return next;
    });
  }, []);

  const formatLanguageName = useCallback((code?: string | null) => {
    const normalized = normalizeLanguageCode(code);
    if (!normalized) {
      return "";
    }
    return LANGUAGE_LABELS[normalized] ?? normalized.toUpperCase();
  }, []);

  const ensureTranslation = useCallback(
    (key: string, text: string, options?: RequestOptions) => {
      if (!translationSupported) {
        return;
      }
      if (!text || text.trim().length === 0) {
        return;
      }

      const trimmed = text.trim();
      const existing = entriesRef.current[key];
      const pending = pendingRequestsRef.current[key];

      if (!options?.force) {
        if (!autoTranslateEnabled) {
          return;
        }
        if (pending) {
          return;
        }
        if (existing && existing.originalText === trimmed) {
          if (existing.status === "loading" || existing.status === "ready") {
            return;
          }
        }
      }

      setEntries((previous) => ({
        ...previous,
        [key]: {
          status: "loading",
          originalText: trimmed,
          translatedText: existing?.translatedText,
          detectedLanguage: existing?.detectedLanguage,
          provider: existing?.provider,
        },
      }));

      const request = (async () => {
        try {
          const result = await translate(trimmed, targetLanguage);
          const detected = normalizeLanguageCode(result.detectedLanguage);
          setEntries((previous) => ({
            ...previous,
            [key]: {
              status: "ready",
              originalText: trimmed,
              translatedText: result.translatedText,
              detectedLanguage: detected,
              provider: result.provider ?? "LibreTranslate",
            },
          }));
          setVisibilityMap((previous) => {
            if (Object.prototype.hasOwnProperty.call(previous, key)) {
              return previous;
            }
            const shouldShowOriginal = !detected || detected === targetLanguage;
            if (shouldShowOriginal) {
              return previous;
            }
            return {
              ...previous,
              [key]: false,
            };
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown translation error";
          setEntries((previous) => ({
            ...previous,
            [key]: {
              status: "error",
              originalText: trimmed,
              error: message,
            },
          }));
        } finally {
          delete pendingRequestsRef.current[key];
        }
      })();

      pendingRequestsRef.current[key] = request;
    },
    [autoTranslateEnabled, targetLanguage, translate, translationSupported],
  );

  const refreshTranslation = useCallback(
    (key: string, text: string) => {
      setVisibilityMap((previous) => {
        if (!Object.prototype.hasOwnProperty.call(previous, key)) {
          return previous;
        }
        const next = { ...previous };
        delete next[key];
        return next;
      });
      ensureTranslation(key, text, { force: true });
    },
    [ensureTranslation],
  );

  const contextValue = useMemo(
    () => ({
      isSupported: translationSupported,
      autoTranslateEnabled,
      setAutoTranslateEnabled,
      ensureTranslation,
      refreshTranslation,
      getTranslation,
      isOriginalVisible,
      toggleOriginal,
      targetLanguage,
      targetLanguageLabel,
      formatLanguageName,
    }),
    [
      autoTranslateEnabled,
      ensureTranslation,
      formatLanguageName,
      getTranslation,
      isOriginalVisible,
      refreshTranslation,
      setAutoTranslateEnabled,
      targetLanguage,
      targetLanguageLabel,
      toggleOriginal,
      translationSupported,
    ],
  );

  return (
    <CommunityTranslationContext.Provider value={contextValue}>
      {children}
    </CommunityTranslationContext.Provider>
  );
};

export const useCommunityTranslation = (): CommunityTranslationContextValue =>
  useContext(CommunityTranslationContext);
