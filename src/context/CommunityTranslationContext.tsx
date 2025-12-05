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
import {
  getCachedTranslation,
  setCachedTranslation,
  type CachedTranslation,
} from "../utils/translationCache";
import { translateTextBulk } from "../utils/translationService";

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
  eventId?: string;
}

interface TranslationJob {
  key: string;
  roomId: string;
  eventId: string;
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
  targetLanguage: string | null;
  targetLanguageLabel: string;
  formatLanguageName: (code?: string | null) => string;
  translationMap: Map<string, string>;
  readRoomTranslations: (roomId: string) => Promise<void>;
}

const noop = () => undefined;

const SUPPORTED_LANGUAGES = new Set<string>(SUPPORTED_LOCALES);
const FALLBACK_LANGUAGE = DEFAULT_LOCALE;
const STORAGE_KEY = "community:autoTranslate";
const MAX_BATCH_SIZE = 2;
const MAX_CONCURRENT_REQUESTS = 2;
const MAX_MESSAGES_PER_ROOM = 30; // only auto-translate most recent messages
const QUEUE_FLUSH_DELAY_MS = 25;
const normalizeLanguageCode = (value?: string | null): string | null => normalizeLocale(value) ?? null;

const resolveTargetLanguage = (): string | null => {
  const browserTag = getBrowserLanguageTag();
  const normalized = normalizeLanguageCode(browserTag);
  if (normalized && SUPPORTED_LANGUAGES.has(normalized)) {
    return normalized;
  }
  return null;
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
  targetLanguage: null,
  targetLanguageLabel: "Original",
  formatLanguageName: (code?: string | null) => (code ? code.toString() : ""),
  translationMap: new Map(),
  readRoomTranslations: async () => {},
};

const CommunityTranslationContext = createContext<CommunityTranslationContextValue>(
  defaultContextValue,
);

export const CommunityTranslationProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { i18n } = useTranslation();
  const browserLanguage = normalizeLanguageCode(getBrowserLanguageTag());
  const isBrowserLanguageSupported =
    browserLanguage !== null && SUPPORTED_LANGUAGES.has(browserLanguage);
  const isSupported =
    typeof fetch === "function" && typeof AbortController === "function" && isBrowserLanguageSupported;

  const resolveLanguagePreference = useCallback((): string | null => resolveTargetLanguage(), []);

  const [targetLanguage, setTargetLanguage] = useState<string | null>(() =>
    resolveLanguagePreference(),
  );
  const [formatter, setFormatter] = useState<Intl.DisplayNames | null>(() =>
    targetLanguage ? createLanguageFormatter(targetLanguage) : null,
  );

  useEffect(() => {
    setTargetLanguage(resolveLanguagePreference());
  }, [i18n.language, resolveLanguagePreference]);

  useEffect(() => {
    setFormatter(targetLanguage ? createLanguageFormatter(targetLanguage) : null);
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
    if (!targetLanguage) {
      return "Original";
    }
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
  const [translationMapState, setTranslationMapState] = useState<Map<string, string>>(
    () => new Map(),
  );
  const entriesRef = useRef(entries);
  const controllersRef = useRef(new Map<string, AbortController>());
  const queueRef = useRef<TranslationJob[]>([]);
  const roomQueueRef = useRef<Map<string, string[]>>(new Map());
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
    setTranslationMapState(new Map());
    queueRef.current = [];
    roomQueueRef.current = new Map();
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

  const mapTranslationKeyToEventId = useCallback((key: string, eventId: string) => {
    setTranslationMapState((current) => {
      const existing = current.get(key);
      if (existing === eventId) {
        return current;
      }
      const next = new Map(current);
      next.set(key, eventId);
      return next;
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (!targetLanguage) {
      return;
    }

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

    const signal = batch[0]?.controller.signal;
    const bulkJobs = batch.map((job) => ({
      id: job.key,
      text: job.originalText,
      sourceLanguage: normalizeLanguageCode(i18n.language) ?? undefined,
      targetLanguage,
      roomId: job.roomId,
      eventId: job.eventId,
      signal,
    }));

    scheduleProcessQueue();

    try {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const translations = await translateTextBulk(bulkJobs);

      const handledKeys = new Set<string>();

      batch.forEach((job) => {
        const result = translations.get(job.key);
        if (!result) {
          return;
        }

        handledKeys.add(job.key);

        mutateEntries((map) => {
          map.set(job.key, {
            status: "success",
            originalText: job.originalText,
            translatedText: result.text,
            detectedLanguage: result.detectedLanguage,
            provider: result.provider,
            error: undefined,
          });
        });

        void setCachedTranslation(job.roomId, job.key, targetLanguage, {
          translatedText: result.text,
          detectedLanguage: result.detectedLanguage,
          provider: result.provider,
        }).catch((cacheError) => {
          console.warn("Unable to cache translation", cacheError);
        });
      });

      batch.forEach((job) => {
        if (handledKeys.has(job.key)) {
          return;
        }

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

        console.error("translation bulk job error", {
          key: job.key,
          roomId: job.roomId,
          retries: job.retries,
          targetLanguage,
          errorMessage: "Missing translation result from bulk request",
        });

        mutateEntries((map) => {
          const existing = map.get(job.key);
          map.set(job.key, {
            status: "error",
            originalText: job.originalText,
            translatedText: existing?.translatedText,
            detectedLanguage: existing?.detectedLanguage,
            provider: existing?.provider,
            error: "Missing translation result from bulk request",
          });
        });
      });
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

        console.error("translation bulk job error", {
          key: job.key,
          roomId: job.roomId,
          retries: job.retries,
          targetLanguage,
          errorMessage: error instanceof Error ? error.message : String(error),
        });

        mutateEntries((map) => {
          const existing = map.get(job.key);
          map.set(job.key, {
            status: "error",
            originalText: job.originalText,
            translatedText: existing?.translatedText,
            detectedLanguage: existing?.detectedLanguage,
            provider: existing?.provider,
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
  }, [
    i18n.language,
    mutateEntries,
    scheduleProcessQueue,
    targetLanguage,
  ]);

  useEffect(() => {
    processQueueRef.current = processQueue;
  }, [processQueue]);

  const readRoomTranslations = useCallback(async (_roomId: string) => {
    // The community translation read endpoint is currently disabled.
    // This placeholder keeps the public API stable without issuing read requests.
    return Promise.resolve();
  }, []);

  const ensureTranslation = useCallback(
    (key: string, text: string, options?: RequestOptions) => {
      void (async () => {
        const originalText = typeof text === "string" ? text : "";

        if (!targetLanguage || ((!autoTranslateEnabled && !options?.force) || !isSupported)) {
          return;
        }

        const trimmed = originalText.trim();
        const eventId = options?.eventId ?? key;
        mapTranslationKeyToEventId(key, eventId);
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

        const pruneRoomQueue = (roomIdToTrim: string, currentKey: string): boolean => {
          const existing = roomQueueRef.current.get(roomIdToTrim) ?? [];
          const deduped = existing.filter((value) => value !== currentKey);
          deduped.push(currentKey);

          const pruned = deduped.slice(-MAX_MESSAGES_PER_ROOM);
          const removedKeys = deduped.slice(0, Math.max(0, deduped.length - pruned.length));

          roomQueueRef.current.set(roomIdToTrim, pruned);

          if (removedKeys.length > 0) {
            const allowedKeys = new Set(pruned);

            queueRef.current = queueRef.current.filter((job) => {
              if (job.roomId !== roomIdToTrim) {
                return true;
              }
              if (allowedKeys.has(job.key)) {
                return true;
              }

              const controller = controllersRef.current.get(job.key);
              if (controller) {
                controller.abort();
                controllersRef.current.delete(job.key);
              }

              return false;
            });

            mutateEntries((map) => {
              removedKeys.forEach((removedKey) => {
                map.delete(removedKey);
              });
            });

            setTranslationMapState((current) => {
              let changed = false;
              const next = new Map(current);
              removedKeys.forEach((removedKey) => {
                if (next.delete(removedKey)) {
                  changed = true;
                }
              });
              return changed ? next : current;
            });
          }

          return pruned.includes(currentKey);
        };

        if (!pruneRoomQueue(roomId, key)) {
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
          eventId,
          originalText,
          controller,
          retries: 0,
        });
        scheduleProcessQueue();
      })();
    },
    [
      autoTranslateEnabled,
      isSupported,
      mapTranslationKeyToEventId,
      mutateEntries,
      scheduleProcessQueue,
      targetLanguage,
    ],
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
      translationMap: translationMapState,
      readRoomTranslations,
    }),
    [
      autoTranslateEnabled,
      ensureTranslation,
      formatLanguageName,
      getTranslation,
      isOriginalVisible,
      isSupported,
      readRoomTranslations,
      refreshTranslation,
      setAutoTranslateEnabled,
      targetLanguage,
      targetLanguageLabel,
      toggleOriginal,
      translationMapState,
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
