import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { getBrowserLanguageTag } from "../utils/browserLanguage";
import { DEFAULT_LOCALE, normalizeLocale, SUPPORTED_LOCALES } from "../utils/locale";
import { translateText } from "../utils/translationService";

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

const SUPPORTED_LANGUAGES = new Set<string>(SUPPORTED_LOCALES);
const FALLBACK_LANGUAGE = DEFAULT_LOCALE;
const STORAGE_KEY = "community:autoTranslate";

const normalizeLanguageCode = (value?: string | null): string | null => normalizeLocale(value) ?? null;

const resolveTargetLanguage = (): string => {
  const browserTag = getBrowserLanguageTag();
  const normalized = normalizeLanguageCode(browserTag);
  if (normalized && SUPPORTED_LANGUAGES.has(normalized)) {
    return normalized;
  }
  return FALLBACK_LANGUAGE;
};

const createLanguageFormatter = (locale: string): Intl.DisplayNames | null => {
  if (typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") {
    return null;
  }
  try {
    return new Intl.DisplayNames([locale], { type: "language" });
  } catch (error) {
    console.warn("Unable to create Intl.DisplayNames with locale", locale, error);
    try {
      return new Intl.DisplayNames([FALLBACK_LANGUAGE], { type: "language" });
    } catch {
      return null;
    }
  }
};

const defaultContextValue: CommunityTranslationContextValue = {
  isSupported: false,
  autoTranslateEnabled: false,
  setAutoTranslateEnabled: noop,
  ensureTranslation: noop,
  refreshTranslation: noop,
  getTranslation: () => undefined,
  isOriginalVisible: () => true,
  toggleOriginal: noop,
  targetLanguage: FALLBACK_LANGUAGE,
  targetLanguageLabel: "English",
  formatLanguageName: (code?: string | null) => (code ? code.toString() : ""),
};

const CommunityTranslationContext = createContext<CommunityTranslationContextValue>(
  defaultContextValue,
);

export const CommunityTranslationProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { i18n } = useTranslation();
  const isSupported = typeof fetch === "function" && typeof AbortController === "function";

  const [targetLanguage, setTargetLanguage] = useState<string>(() =>
    normalizeLanguageCode(i18n.language) ?? resolveTargetLanguage(),
  );
  const [formatter, setFormatter] = useState<Intl.DisplayNames | null>(() =>
    createLanguageFormatter(targetLanguage),
  );

  useEffect(() => {
    const normalized = normalizeLanguageCode(i18n.language) ?? resolveTargetLanguage();
    setTargetLanguage(normalized);
  }, [i18n.language]);

  useEffect(() => {
    setFormatter(createLanguageFormatter(targetLanguage));
  }, [targetLanguage]);

  const formatLanguageName = useCallback(
    (code?: string | null) => {
      const normalized = normalizeLanguageCode(code);
      if (!normalized) {
        return "";
      }
      if (formatter) {
        try {
          const label = formatter.of(normalized);
          if (label) {
            return label;
          }
        } catch (error) {
          console.warn("Unable to format language", normalized, error);
        }
      }
      return normalized;
    },
    [formatter],
  );

  const targetLanguageLabel = useMemo(() => {
    const formatted = formatLanguageName(targetLanguage);
    if (formatted && formatted.trim().length > 0) {
      return formatted;
    }
    return targetLanguage.toUpperCase();
  }, [formatLanguageName, targetLanguage]);

  const [autoTranslateEnabled, setAutoTranslateEnabledState] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "false") {
        return false;
      }
      if (stored === "true") {
        return true;
      }
    } catch (storageError) {
      console.warn("Unable to read translation preference", storageError);
    }
    return true;
  });

  const setAutoTranslateEnabled = useCallback((value: boolean) => {
    setAutoTranslateEnabledState(value);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
      } catch (storageError) {
        console.warn("Unable to persist translation preference", storageError);
      }
    }
  }, []);

  const [entries, setEntries] = useState<Map<string, TranslationEntry>>(() => new Map());
  const entriesRef = useRef(entries);
  const controllersRef = useRef(new Map<string, AbortController>());

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
    setEntries(new Map());
  }, [targetLanguage]);

  const [visibleOriginals, setVisibleOriginals] = useState<Set<string>>(() => new Set());

  const mutateEntries = useCallback((updater: (map: Map<string, TranslationEntry>) => void) => {
    setEntries((current) => {
      const next = new Map(current);
      updater(next);
      return next;
    });
  }, []);

  const ensureTranslation = useCallback(
    (key: string, text: string, options?: RequestOptions) => {
      if (!isSupported) {
        return;
      }

      const originalText = typeof text === "string" ? text : "";
      const trimmed = originalText.trim();

      mutateEntries((map) => {
        const existing = map.get(key);
        if (!existing || existing.originalText !== originalText) {
          map.set(key, {
            status: existing?.status ?? "idle",
            originalText,
            translatedText: existing?.translatedText,
            detectedLanguage: existing?.detectedLanguage,
            provider: existing?.provider,
            error: undefined,
          });
        }
      });

      if (!autoTranslateEnabled && !options?.force) {
        return;
      }

      const existing = entriesRef.current.get(key);
      const shouldReuseExisting =
        !options?.force &&
        existing &&
        existing.originalText === originalText &&
        (existing.status === "loading" || existing.status === "ready");

      if (shouldReuseExisting) {
        return;
      }

      if (!trimmed) {
        mutateEntries((map) => {
          map.set(key, {
            status: "ready",
            originalText,
            translatedText: "",
            detectedLanguage: undefined,
            provider: existing?.provider,
            error: undefined,
          });
        });
        return;
      }

      const previousController = controllersRef.current.get(key);
      if (previousController) {
        previousController.abort();
      }

      const controller = new AbortController();
      controllersRef.current.set(key, controller);

      mutateEntries((map) => {
        const current = map.get(key);
        map.set(key, {
          status: "loading",
          originalText,
          translatedText: current?.translatedText,
          detectedLanguage: current?.detectedLanguage,
          provider: current?.provider,
          error: undefined,
        });
      });

      translateText({ text: originalText, targetLanguage, signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) {
            return;
          }
          const detected = normalizeLanguageCode(result.detectedLanguage) ?? undefined;
          const translatedText = result.text ?? "";

          mutateEntries((map) => {
            map.set(key, {
              status: "ready",
              originalText,
              translatedText,
              detectedLanguage: detected,
              provider: result.provider,
              error: undefined,
            });
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          mutateEntries((map) => {
            map.set(key, {
              status: "error",
              originalText,
              translatedText: undefined,
              detectedLanguage: undefined,
              provider: undefined,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        })
        .finally(() => {
          controllersRef.current.delete(key);
        });
    },
    [autoTranslateEnabled, isSupported, mutateEntries, targetLanguage],
  );

  const refreshTranslation = useCallback(
    (key: string, text: string) => ensureTranslation(key, text, { force: true }),
    [ensureTranslation],
  );

  useEffect(
    () => () => {
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
    },
    [],
  );

  const getTranslation = useCallback(
    (key: string) => entries.get(key),
    [entries],
  );

  const isOriginalVisible = useCallback(
    (key: string) => visibleOriginals.has(key),
    [visibleOriginals],
  );

  const toggleOriginal = useCallback((key: string) => {
    setVisibleOriginals((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const contextValue = useMemo<CommunityTranslationContextValue>(
    () => ({
      isSupported,
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
      isSupported,
      refreshTranslation,
      setAutoTranslateEnabled,
      targetLanguage,
      targetLanguageLabel,
      toggleOriginal,
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
