import React from "react";
import { useTheme } from "../context/ThemeContext";
import { usePreferences } from "../context/PreferencesContext";

export default function Settings() {
  const { theme, setTheme, toggle } = useTheme();
  const { thunderSoundEnabled, setThunderSoundEnabled } = usePreferences();

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h2 className="text-xl font-semibold mb-2">Settings</h2>

      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 p-4">
        <h3 className="font-medium mb-3">Theme</h3>
        <div className="inline-flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <button
              onClick={() => setTheme("light")}
              className={`px-3 py-1.5 text-sm ${theme === "light" ? "bg-brand text-white" : ""}`}
            >
              Light
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`px-3 py-1.5 text-sm ${theme === "dark" ? "bg-brand text-white" : ""}`}
            >
              Dark
            </button>
          </div>
          <button
            onClick={toggle}
            className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700"
          >
            Toggle
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 p-4">
        <h3 className="font-medium mb-3">Sound</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Thunder sound</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Play a thunder strike when you earn new points.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={thunderSoundEnabled}
            onClick={() => setThunderSoundEnabled(!thunderSoundEnabled)}
            className={`relative inline-flex h-6 w-12 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              thunderSoundEnabled
                ? "bg-brand"
                : "bg-neutral-300 dark:bg-neutral-700"
            }`}
          >
            <span className="sr-only">Toggle thunder sound</span>
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                thunderSoundEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">
          This sound effect is off by default and saved to your preferences.
        </p>
      </div>
    </div>
  );
}
