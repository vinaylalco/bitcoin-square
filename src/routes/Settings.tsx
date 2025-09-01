import { useTheme } from "../context/ThemeContext";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-semibold">⚙️ Settings</h1>
      <div className="flex items-center gap-4">
        <span>Theme:</span>
        <button
          onClick={toggleTheme}
          className="px-4 py-2 rounded-lg border border-brand text-brand"
        >
          {theme === "light" ? "Switch to Dark" : "Switch to Light"}
        </button>
      </div>
    </div>
  );
}
