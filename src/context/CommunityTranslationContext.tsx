import React, { createContext, useContext } from "react";

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

export const CommunityTranslationProvider: React.FC<React.PropsWithChildren> = ({ children }) => (
  <CommunityTranslationContext.Provider value={defaultContextValue}>
    {children}
  </CommunityTranslationContext.Provider>
);

export const useCommunityTranslation = (): CommunityTranslationContextValue =>
  useContext(CommunityTranslationContext);
