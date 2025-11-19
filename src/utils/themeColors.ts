export function getThemeColor(variableName: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName);
  return value?.trim() || fallback;
}
