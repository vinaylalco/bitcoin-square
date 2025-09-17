import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { strapiFetch } from "../api/strapi-client";

interface PreferencesContextValue {
  thunderSoundEnabled: boolean;
  setThunderSoundEnabled: (value: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const STORAGE_KEY = "pref:thunder-sound";

function readLocalPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    // ignore storage errors
  }
  return false;
}

function writeLocalPreference(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {
    // ignore storage errors
  }
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user, token, updateUser } = useAuth();
  const [thunderSoundEnabled, setThunderSoundEnabledState] = useState<boolean>(() => {
    if (typeof user?.preferences?.thunderSoundEnabled === "boolean") {
      return user.preferences.thunderSoundEnabled;
    }
    return readLocalPreference();
  });

  useEffect(() => {
    if (typeof user?.preferences?.thunderSoundEnabled === "boolean") {
      setThunderSoundEnabledState(user.preferences.thunderSoundEnabled);
      return;
    }
    setThunderSoundEnabledState(readLocalPreference());
  }, [user?.id, user?.preferences?.thunderSoundEnabled]);

  const setThunderSoundEnabled = useCallback(
    (value: boolean) => {
      setThunderSoundEnabledState(value);
      writeLocalPreference(value);

      if (!user) return;

      updateUser((prev) => {
        if (!prev) return prev;
        const nextPreferences = {
          ...(prev.preferences ?? {}),
          thunderSoundEnabled: value,
        };
        return {
          ...prev,
          preferences: nextPreferences,
        };
      });

      if (!token) return;

      const body = {
        preferences: {
          ...(user.preferences ?? {}),
          thunderSoundEnabled: value,
        },
      };

      void strapiFetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }).catch((error) => {
        console.error("Failed to save preferences", error);
      });
    },
    [token, updateUser, user],
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({ thunderSoundEnabled, setThunderSoundEnabled }),
    [setThunderSoundEnabled, thunderSoundEnabled],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return ctx;
}
