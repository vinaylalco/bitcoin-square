const LOCAL_PROGRESS_STORAGE_KEY = "lesson-progress";

export interface LocalProgress {
  points: number;
  lessonCompletions: Record<string, string[]>;
  studyStreak: number;
  lastStudyDate: string | null;
}

export function normalizeCardId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function normalizeLessonCompletionList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  value.forEach((entry) => {
    const normalized = normalizeCardId(entry);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
    }
  });
  return Array.from(seen.values());
}

export function createEmptyLocalProgress(): LocalProgress {
  return { points: 0, lessonCompletions: {}, studyStreak: 0, lastStudyDate: null };
}

function parseDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getTodayKey(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function toUtcTimestamp(key: string | null): number | null {
  if (!key) return null;
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if ([year, month, day].some((part) => !Number.isFinite(part))) return null;
  return Date.UTC(year, month - 1, day);
}

function differenceInDays(from: string | null, to: string): number | null {
  const fromTs = toUtcTimestamp(from);
  const toTs = toUtcTimestamp(to);
  if (fromTs === null || toTs === null) return null;
  return Math.round((toTs - fromTs) / MS_PER_DAY);
}

export function calculateNextStudyStreak(
  currentStreak: number | null | undefined,
  lastStudyDate: string | null | undefined,
): { streak: number; lastStudyDate: string; changed: boolean } {
  const today = getTodayKey();
  const normalizedStreak =
    typeof currentStreak === "number" && Number.isFinite(currentStreak)
      ? Math.max(0, Math.floor(currentStreak))
      : 0;
  const diff = differenceInDays(lastStudyDate ?? null, today);
  if (diff === null) {
    return { streak: 1, lastStudyDate: today, changed: true };
  }
  if (diff === 0) {
    const streak = Math.max(normalizedStreak, 1);
    return {
      streak,
      lastStudyDate: today,
      changed: streak !== normalizedStreak || lastStudyDate !== today,
    };
  }
  if (diff === 1) {
    return { streak: Math.max(normalizedStreak, 0) + 1, lastStudyDate: today, changed: true };
  }
  if (diff > 1) {
    return { streak: 1, lastStudyDate: today, changed: true };
  }
  // diff < 0 (future date stored) – reset and normalise
  return { streak: 1, lastStudyDate: today, changed: true };
}

export function readLocalProgress(): LocalProgress {
  if (typeof window === "undefined") {
    return createEmptyLocalProgress();
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_PROGRESS_STORAGE_KEY);
    if (!raw) {
      return createEmptyLocalProgress();
    }
    const parsed = JSON.parse(raw) as {
      points?: unknown;
      lessonCompletions?: Record<string, unknown>;
      studyStreak?: unknown;
      lastStudyDate?: unknown;
    };
    const pointsValue =
      typeof parsed.points === "number" && Number.isFinite(parsed.points)
        ? parsed.points
        : Number(parsed.points ?? 0);
    const lessonCompletions: Record<string, string[]> = {};
    if (parsed.lessonCompletions && typeof parsed.lessonCompletions === "object") {
      Object.entries(parsed.lessonCompletions).forEach(([key, value]) => {
        const normalized = normalizeLessonCompletionList(value);
        if (normalized.length > 0) {
          lessonCompletions[key] = normalized;
        }
      });
    }
    const studyStreakValue =
      typeof parsed.studyStreak === "number" && Number.isFinite(parsed.studyStreak)
        ? Math.max(0, Math.floor(parsed.studyStreak))
        : Number.isFinite(Number(parsed.studyStreak))
          ? Math.max(0, Math.floor(Number(parsed.studyStreak)))
          : 0;
    const lastStudyDate = parseDateKey(parsed.lastStudyDate) ?? null;
    return {
      points: Number.isFinite(pointsValue) ? pointsValue : 0,
      lessonCompletions,
      studyStreak: studyStreakValue,
      lastStudyDate,
    };
  } catch {
    return createEmptyLocalProgress();
  }
}

export function persistLocalProgress(progress: LocalProgress) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {}
}

export function hasLocalData(progress: LocalProgress): boolean {
  if (progress.points > 0 || progress.studyStreak > 0) return true;
  return Object.values(progress.lessonCompletions).some((list) => list.length > 0);
}

export function clearStoredLocalProgress() {
  const empty = createEmptyLocalProgress();
  persistLocalProgress(empty);
}

export { LOCAL_PROGRESS_STORAGE_KEY };
