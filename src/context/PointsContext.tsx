import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { strapiFetch } from "../api/strapi-client";
import { useAuth } from "./AuthContext";

type PointsState = {
  points: number;
  completedLessonIds: string[];
};

type PointsContextValue = {
  points: number;
  completedLessonIds: string[];
  hasCompleted: (lessonId: string) => boolean;
  completeLesson: (lessonId: string, awardAmount?: number) => Promise<boolean>;
};

const STORAGE_KEY = "btc-course-progress";

const defaultState: PointsState = {
  points: 0,
  completedLessonIds: [],
};

const PointsCtx = createContext<PointsContextValue | null>(null);

function loadState(): PointsState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<PointsState>;
    const points = Number(parsed.points) || 0;
    const completedLessonIds = Array.isArray(parsed.completedLessonIds)
      ? parsed.completedLessonIds.filter((id): id is string => typeof id === "string")
      : [];
    return { points, completedLessonIds };
  } catch (err) {
    console.error("Failed to read points from storage", err);
    return defaultState;
  }
}

function persistState(state: PointsState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to persist points to storage", err);
  }
}

export function PointsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PointsState>(() => loadState());
  const lastSyncedRef = useRef<number | null>(null);
  const { user, token, updateUser } = useAuth();

  useEffect(() => {
    persistState(state);
  }, [state]);

  const hasCompleted = useCallback(
    (lessonId: string) => state.completedLessonIds.includes(lessonId),
    [state.completedLessonIds],
  );

  const syncToBackend = useCallback(
    async (points: number, completed: string[]) => {
      if (!user || !token) return;
      try {
        await strapiFetch(`/api/users/${user.id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            points,
            lessonCompletions: completed,
          }),
        });
        updateUser({ points });
        lastSyncedRef.current = points;
      } catch (err) {
        console.error("Failed to sync points to Strapi", err);
      }
    },
    [token, updateUser, user],
  );

  const completeLesson = useCallback(
    async (lessonId: string, awardAmount = 10) => {
      if (!lessonId) return false;
      let awarded = false;
      let nextPoints = 0;
      let nextCompleted: string[] = [];

      setState((prev) => {
        if (prev.completedLessonIds.includes(lessonId)) {
          nextPoints = prev.points;
          nextCompleted = prev.completedLessonIds;
          return prev;
        }
        awarded = true;
        nextPoints = prev.points + awardAmount;
        nextCompleted = [...prev.completedLessonIds, lessonId];
        return { points: nextPoints, completedLessonIds: nextCompleted };
      });

      if (awarded) {
        if (user && token) {
          await syncToBackend(nextPoints, nextCompleted);
        } else {
          lastSyncedRef.current = null;
        }
      }

      return awarded;
    },
    [syncToBackend, token, user],
  );

  useEffect(() => {
    if (!user || !token) {
      lastSyncedRef.current = null;
      return;
    }
    const remotePoints = user.points ?? 0;
    if (remotePoints >= state.points) {
      if (remotePoints !== state.points) {
        setState((prev) => ({ ...prev, points: remotePoints }));
      }
      lastSyncedRef.current = remotePoints;
      return;
    }

    if (lastSyncedRef.current === state.points) {
      return;
    }

    void syncToBackend(state.points, state.completedLessonIds);
  }, [state.points, state.completedLessonIds, syncToBackend, token, user]);

  const value = useMemo<PointsContextValue>(
    () => ({
      points: state.points,
      completedLessonIds: state.completedLessonIds,
      hasCompleted,
      completeLesson,
    }),
    [completeLesson, hasCompleted, state.completedLessonIds, state.points],
  );

  return <PointsCtx.Provider value={value}>{children}</PointsCtx.Provider>;
}

export function usePoints() {
  const ctx = useContext(PointsCtx);
  if (!ctx) throw new Error("usePoints must be used within PointsProvider");
  return ctx;
}
