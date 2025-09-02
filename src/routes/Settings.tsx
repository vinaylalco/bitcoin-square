import React from "react";
import { useTheme } from "../context/ThemeContext";

export default function Settings() {
  const { theme, setTheme, toggle } = useTheme();

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
    </div>
  );
}
