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
import { strapiFetch } from "../lib/strapi";
import {
  getCachedTranslation,
  setCachedTranslation,
  type CachedTranslation,
} from "../utils/translationCache";

type TranslationStatus = "idle" | "loading" | "ready" | "success" | "error";

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
  roomId?: string;
}

interface TranslationJob {
  key: string;
  roomId: string;
  originalText: string;
  controller: AbortController;
  retries: number;
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
const MAX_BATCH_SIZE = 20;
const MAX_CONCURRENT_REQUESTS = 4;
const QUEUE_FLUSH_DELAY_MS = 25;

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
  const queueRef = useRef<TranslationJob[]>([]);
  const activeCountRef = useRef(0);
  const processQueueRef = useRef<() => void>(() => {});
  const processTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
    setEntries(new Map());
    queueRef.current = [];
    activeCountRef.current = 0;
    if (processTimerRef.current) {
      clearTimeout(processTimerRef.current);
      processTimerRef.current = null;
    }
  }, [targetLanguage]);

  const [visibleOriginals, setVisibleOriginals] = useState<Set<string>>(() => new Set());

  const mutateEntries = useCallback((updater: (map: Map<string, TranslationEntry>) => void) => {
    setEntries((current) => {
      const next = new Map(current);
      updater(next);
      return next;
    });
  }, []);

  const scheduleProcessQueue = useCallback(() => {
    if (processTimerRef.current !== null) {
      return;
    }
    if (queueRef.current.length === 0) {
      return;
    }
    processTimerRef.current = setTimeout(() => {
      processTimerRef.current = null;
      void processQueueRef.current();
    }, QUEUE_FLUSH_DELAY_MS);
  }, []);

  const processQueue = useCallback(async () => {
    if (activeCountRef.current >= MAX_CONCURRENT_REQUESTS) {
      return;
    }

    if (queueRef.current.length === 0) {
      return;
    }

    const batch = queueRef.current.splice(0, MAX_BATCH_SIZE);
    if (batch.length === 0) {
      return;
    }

    activeCountRef.current += 1;

    const body = {
      targetLanguage,
      items: batch.map((job) => ({ key: job.key, text: job.originalText })),
    };

    const signal = batch[0]?.controller.signal;
    const jobsByKey = new Map(batch.map((job) => [job.key, job]));

    scheduleProcessQueue();

    try {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const response = await strapiFetch("/translate/bulk", {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });

      const translations = Array.isArray(response?.translations)
        ? response.translations
        : [];

      const translatedKeys = new Set<string>();

      translations.forEach((item) => {
        if (!item || typeof item !== "object") {
          return;
        }
        const record = item as Record<string, unknown>;
        const key = typeof record.key === "string" ? record.key : undefined;
        if (!key) {
          return;
        }

        const job = jobsByKey.get(key);
        if (!job) {
          return;
        }

        translatedKeys.add(key);

        const translatedText =
          (typeof record.translatedText === "string" && record.translatedText) ||
          (typeof record.translation === "string" && record.translation) ||
          (typeof record.text === "string" && record.text) ||
          "";

        const detectedLanguage =
          normalizeLanguageCode(
            (typeof record.detectedLanguage === "string" && record.detectedLanguage) ||
              (typeof record.detected_language === "string" && record.detected_language) ||
              undefined,
          ) ?? undefined;

        const provider = typeof record.provider === "string" ? record.provider : undefined;

        mutateEntries((map) => {
          map.set(key, {
            status: "success",
            originalText: job.originalText,
            translatedText,
            detectedLanguage,
            provider,
            error: undefined,
          });
        });

        setCachedTranslation(job.roomId, key, targetLanguage, {
          translatedText,
          detectedLanguage,
          provider,
        }).catch((cacheError) => {
          console.warn("Unable to cache translation", cacheError);
        });
      });

      if (translatedKeys.size < batch.length) {
        batch
          .filter((job) => !translatedKeys.has(job.key))
          .forEach((job) => {
            mutateEntries((map) => {
              map.set(job.key, {
                status: "error",
                originalText: job.originalText,
                translatedText: undefined,
                detectedLanguage: undefined,
                provider: undefined,
                error: "Translation unavailable",
              });
            });
          });
      }
    } catch (error: unknown) {
      if (signal?.aborted) {
        return;
      }

      batch.forEach((job) => {
        if (job.retries < 3) {
          const retryController = new AbortController();
          controllersRef.current.set(job.key, retryController);
          queueRef.current.push({
            ...job,
            retries: job.retries + 1,
            controller: retryController,
          });
          return;
        }

        mutateEntries((map) => {
          map.set(job.key, {
            status: "error",
            originalText: job.originalText,
            translatedText: undefined,
            detectedLanguage: undefined,
            provider: undefined,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      });

      scheduleProcessQueue();
    } finally {
      batch.forEach((job) => {
        const existing = controllersRef.current.get(job.key);
        if (existing === job.controller) {
          controllersRef.current.delete(job.key);
        }
      });
      activeCountRef.current = Math.max(0, activeCountRef.current - 1);
      scheduleProcessQueue();
    }
  }, [mutateEntries, scheduleProcessQueue, targetLanguage]);

  useEffect(() => {
    processQueueRef.current = processQueue;
  }, [processQueue]);

  const ensureTranslation = useCallback(
    (key: string, text: string, options?: RequestOptions) => {
      void (async () => {
        const originalText = typeof text === "string" ? text : "";

        if ((!autoTranslateEnabled && !options?.force) || !isSupported) {
          return;
        }

        const trimmed = originalText.trim();
        const roomId = options?.roomId ?? key;

        let cached: CachedTranslation | null = null;
        try {
          cached = await getCachedTranslation(roomId, key, targetLanguage);
        } catch (cacheError) {
          console.warn("Unable to read cached translation", cacheError);
        }

        if (cached && !options?.force) {
          mutateEntries((map) => {
            map.set(key, {
              status: "success",
              originalText,
              translatedText: cached.translatedText,
              detectedLanguage: cached.detectedLanguage,
              provider: cached.provider,
              error: undefined,
            });
          });
          return;
        }

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

        const existing = entriesRef.current.get(key);
        const shouldReuseExisting =
          !options?.force &&
          existing &&
          existing.originalText === originalText &&
          (existing.status === "loading" || existing.status === "ready" || existing.status === "success");

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

        queueRef.current = queueRef.current.filter((job) => job.key !== key);

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

        queueRef.current.push({
          key,
          roomId,
          originalText,
          controller,
          retries: 0,
        });
        scheduleProcessQueue();
      })();
    },
    [autoTranslateEnabled, isSupported, mutateEntries, scheduleProcessQueue, targetLanguage],
  );

  const refreshTranslation = useCallback(
    (key: string, text: string) => ensureTranslation(key, text, { force: true }),
    [ensureTranslation],
  );

  useEffect(
    () => () => {
      if (processTimerRef.current) {
        clearTimeout(processTimerRef.current);
      }
      queueRef.current = [];
      activeCountRef.current = 0;
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
