import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { TranslateTextResult } from "../utils/translationService";
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

const DEFAULT_LANGUAGE = "en";
const AUTO_TRANSLATE_STORAGE_KEY = "community:autoTranslate";
const MAX_CONCURRENT_TRANSLATIONS = 4;

const noop = () => undefined;

const defaultContextValue: CommunityTranslationContextValue = {
  autoTranslateEnabled: false,
  setAutoTranslateEnabled: noop,
  ensureTranslation: noop,
  refreshTranslation: noop,
  getTranslation: () => undefined,
  isOriginalVisible: () => true,
  toggleOriginal: noop,
  targetLanguage: DEFAULT_LANGUAGE,
  targetLanguageLabel: "English",
  formatLanguageName: (code?: string | null) => (code ? code.toString() : ""),
};

const CommunityTranslationContext = createContext<CommunityTranslationContextValue>(
  defaultContextValue,
);

interface TranslationJob {
  combinedKey: string;
  originalText: string;
}

const detectBrowserLanguage = (): string => {
  if (typeof navigator === "undefined") {
    return DEFAULT_LANGUAGE;
  }
  const candidates: string[] = [];
  if (Array.isArray(navigator.languages)) {
    candidates.push(...navigator.languages.filter((value): value is string => typeof value === "string"));
  }
  if (typeof navigator.language === "string") {
    candidates.push(navigator.language);
  }
  const raw = candidates.find((value) => value && value.trim().length > 0) ?? DEFAULT_LANGUAGE;
  return raw.split("-")[0]?.toLowerCase() ?? DEFAULT_LANGUAGE;
};

const useLanguageDisplayName = (language: string) => {
  const localeKey = useMemo(() => {
    if (typeof navigator === "undefined") return language;
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
      return navigator.languages.join("|");
    }
    return navigator.language ?? language;
  }, [language]);

  const displayNames = useMemo(() => {
    if (typeof Intl === "undefined" || typeof Intl.DisplayNames === "undefined") {
      return null;
    }
    try {
      const locales = localeKey.split("|").filter(Boolean);
      return new Intl.DisplayNames(locales.length > 0 ? locales : undefined, { type: "language" });
    } catch (error) {
      console.warn("Unable to create language display names", error);
      return null;
    }
  }, [localeKey]);

  const formatLanguageName = useCallback(
    (code?: string | null) => {
      if (!code) return "";
      const normalized = code.toLowerCase();
      if (displayNames) {
        const label = displayNames.of(normalized);
        if (label) {
          return label.charAt(0).toUpperCase() + label.slice(1);
        }
      }
      return normalized.toUpperCase();
    },
    [displayNames],
  );

  const label = useMemo(() => formatLanguageName(language), [formatLanguageName, language]);

  return { formatLanguageName, label };
};

export const CommunityTranslationProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(AUTO_TRANSLATE_STORAGE_KEY);
    return stored !== "off";
  });

  const [browserLanguage] = useState(() => detectBrowserLanguage());
  const { formatLanguageName, label: targetLanguageLabel } = useLanguageDisplayName(browserLanguage);

  const [translations, setTranslations] = useState<Map<string, TranslationEntry>>(() => new Map());
  const [originalOverrides, setOriginalOverrides] = useState<Set<string>>(() => new Set());

  const jobsRef = useRef<TranslationJob[]>([]);
  const activeControllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AUTO_TRANSLATE_STORAGE_KEY, autoTranslateEnabled ? "on" : "off");
  }, [autoTranslateEnabled]);

  const normalizedLanguage = browserLanguage || DEFAULT_LANGUAGE;

  const processQueue = useCallback(() => {
    if (!autoTranslateEnabled) return;
    while (
      activeControllersRef.current.size < MAX_CONCURRENT_TRANSLATIONS &&
      jobsRef.current.length > 0
    ) {
      const job = jobsRef.current.shift();
      if (!job) break;
      if (activeControllersRef.current.has(job.combinedKey)) {
        continue;
      }
      const controller = new AbortController();
      activeControllersRef.current.set(job.combinedKey, controller);

      translateText({ text: job.originalText, targetLanguage: normalizedLanguage, signal: controller.signal })
        .then((result: TranslateTextResult) => {
          setTranslations((prev) => {
            const existing = prev.get(job.combinedKey);
            if (!existing || existing.originalText !== job.originalText) {
              return prev;
            }
            const next = new Map(prev);
            next.set(job.combinedKey, {
              status: "ready",
              originalText: existing.originalText,
              translatedText: result.text,
              detectedLanguage: result.detectedLanguage,
              provider: result.provider,
            });
            return next;
          });
        })
        .catch((error: unknown) => {
          if ((error as { name?: string })?.name === "AbortError") {
            return;
          }
          setTranslations((prev) => {
            const existing = prev.get(job.combinedKey);
            if (!existing || existing.originalText !== job.originalText) {
              return prev;
            }
            const next = new Map(prev);
            next.set(job.combinedKey, {
              ...existing,
              status: "error",
              error: String(error),
            });
            return next;
          });
        })
        .finally(() => {
          activeControllersRef.current.delete(job.combinedKey);
          processQueue();
        });
    }
  }, [autoTranslateEnabled, normalizedLanguage]);

  useEffect(() => {
    return () => {
      activeControllersRef.current.forEach((controller) => controller.abort());
      activeControllersRef.current.clear();
      jobsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!autoTranslateEnabled) {
      activeControllersRef.current.forEach((controller) => controller.abort());
      activeControllersRef.current.clear();
    } else {
      processQueue();
    }
  }, [autoTranslateEnabled, processQueue]);

  const ensureTranslation = useCallback(
    (key: string, text: string, options?: RequestOptions) => {
      const original = text.trim();
      if (!original) return;
      const combinedKey = `${key}::${normalizedLanguage}`;
      let shouldEnqueue = false;
      setTranslations((prev) => {
        const existing = prev.get(combinedKey);
        if (
          !options?.force &&
          existing &&
          existing.originalText === original &&
          (existing.status === "loading" || existing.status === "ready")
        ) {
          return prev;
        }
        shouldEnqueue = true;
        const next = new Map(prev);
        next.set(combinedKey, {
          status: "loading",
          originalText: original,
          translatedText: existing?.translatedText,
          detectedLanguage: existing?.detectedLanguage,
          provider: existing?.provider,
        });
        return next;
      });

      if (!shouldEnqueue) {
        return;
      }

      jobsRef.current = jobsRef.current.filter((job) => job.combinedKey !== combinedKey);
      jobsRef.current.push({ combinedKey, originalText: original });
      processQueue();
    },
    [normalizedLanguage, processQueue],
  );

  const refreshTranslation = useCallback(
    (key: string, text: string) => {
      ensureTranslation(key, text, { force: true });
    },
    [ensureTranslation],
  );

  const toggleOriginal = useCallback((key: string) => {
    setOriginalOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const isOriginalVisible = useCallback(
    (key: string) => originalOverrides.has(key),
    [originalOverrides],
  );

  const getTranslation = useCallback(
    (key: string) => translations.get(`${key}::${normalizedLanguage}`),
    [translations, normalizedLanguage],
  );

  const value = useMemo<CommunityTranslationContextValue>(
    () => ({
      autoTranslateEnabled,
      setAutoTranslateEnabled,
      ensureTranslation,
      refreshTranslation,
      getTranslation,
      isOriginalVisible,
      toggleOriginal,
      targetLanguage: normalizedLanguage,
      targetLanguageLabel,
      formatLanguageName,
    }),
    [
      autoTranslateEnabled,
      ensureTranslation,
      formatLanguageName,
      getTranslation,
      isOriginalVisible,
      normalizedLanguage,
      refreshTranslation,
      setAutoTranslateEnabled,
      targetLanguageLabel,
      toggleOriginal,
    ],
  );

  return (
    <CommunityTranslationContext.Provider value={value}>
      {children}
    </CommunityTranslationContext.Provider>
  );
};

export const useCommunityTranslation = (): CommunityTranslationContextValue =>
  useContext(CommunityTranslationContext);
