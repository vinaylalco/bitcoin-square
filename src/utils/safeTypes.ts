export const safeArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);

export const safeString = (value: unknown): string => (typeof value === "string" ? value : "");
