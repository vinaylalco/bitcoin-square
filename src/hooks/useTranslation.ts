import { useCallback, useState } from "react";
import translateText from "../utils/translateText";

interface UseTranslationState {
  translatedText: string;
  loading: boolean;
  error: string | null;
}

export const useTranslation = () => {
  const [state, setState] = useState<UseTranslationState>({
    translatedText: "",
    loading: false,
    error: null,
  });

  const translate = useCallback(async (text: string, targetLang: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const translated = await translateText(text, targetLang);
      setState({ translatedText: translated, loading: false, error: null });
      return translated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState({ translatedText: "", loading: false, error: message });
      throw error;
    }
  }, []);

  return {
    translate,
    translatedText: state.translatedText,
    loading: state.loading,
    error: state.error,
  };
};

export default useTranslation;
