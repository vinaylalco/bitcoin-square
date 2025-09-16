import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { Card as CardType, Module } from "../../types/lesson-plan";
import Card from "./Card";
import { strapiFetch } from "../../api/strapi-client";
import { useAuth } from "../../context/AuthContext";
import LessonPointsCounter from "./LessonPointsCounter";

interface SliderCard extends CardType {
  topicName: string;
  moduleName: string;
}

const LOCAL_PROGRESS_STORAGE_KEY = "lesson-progress";

interface LocalProgress {
  points: number;
  lessonCompletions: Record<string, string[]>;
  studyStreak: number;
  lastStudyDate: string | null;
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

function toUtcTimestamp(key: string | null): number | null {
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

function calculateNextStudyStreak(
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

function readLocalProgress(): LocalProgress {
  if (typeof window === "undefined") {
    return { points: 0, lessonCompletions: {}, studyStreak: 0, lastStudyDate: null };
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_PROGRESS_STORAGE_KEY);
    if (!raw) {
      return { points: 0, lessonCompletions: {}, studyStreak: 0, lastStudyDate: null };
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
        if (Array.isArray(value)) {
          lessonCompletions[key] = value.filter((item): item is string => typeof item === "string");
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
    return { points: 0, lessonCompletions: {}, studyStreak: 0, lastStudyDate: null };
  }
}

function persistLocalProgress(progress: LocalProgress) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {}
}

function hasLocalData(progress: LocalProgress): boolean {
  if (progress.points > 0 || progress.studyStreak > 0) return true;
  return Object.values(progress.lessonCompletions).some((list) => list.length > 0);
}

function createBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDerivX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  function solveCurveX(x: number) {
    let t2 = x;
    for (let i = 0; i < 8; i++) {
      const x2 = sampleCurveX(t2) - x;
      if (Math.abs(x2) < 1e-6) return t2;
      const d2 = sampleDerivX(t2);
      if (Math.abs(d2) < 1e-6) break;
      t2 -= x2 / d2;
    }
    let t0 = 0;
    let t1 = 1;
    t2 = x;
    while (t0 < t1) {
      const x2 = sampleCurveX(t2) - x;
      if (Math.abs(x2) < 1e-6) return t2;
      if (x2 > 0) t1 = t2;
      else t0 = t2;
      t2 = (t1 + t0) / 2;
    }
    return t2;
  }
  return (x: number) => sampleCurveY(solveCurveX(x));
}

export default function Slider({
  cards,
  modules,
  courseTitle,
  lessonSlug,
}: {
  cards: SliderCard[];
  modules: Module[];
  courseTitle?: string;
  lessonSlug?: string;
}) {
  const [index, setIndex] = useState(0);
  const total = cards.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [chrome, setChrome] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const progressContainerRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const cardWrappers = useRef(new Map<string, HTMLDivElement>());
  const [navHeight, setNavHeight] = useState<number | null>(null);
  const { user, token, updateUser } = useAuth();
  const initialLocalProgress = useMemo(() => readLocalProgress(), []);
  const [localProgress, setLocalProgress] = useState<LocalProgress>(initialLocalProgress);
  const [displayPoints, setDisplayPoints] = useState<number>(
    () => user?.points ?? initialLocalProgress.points ?? 0,
  );
  const [displayStreak, setDisplayStreak] = useState<number>(
    () => user?.studyStreak ?? initialLocalProgress.studyStreak ?? 0,
  );
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [completedCardIds, setCompletedCardIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (lessonSlug) {
      (user?.lessonCompletions?.[lessonSlug] ?? []).forEach((id) => {
        if (typeof id === "string") {
          initial.add(id);
        }
      });
      (initialLocalProgress.lessonCompletions?.[lessonSlug] ?? []).forEach((id) => {
        if (typeof id === "string") {
          initial.add(id);
        }
      });
    }
    return initial;
  });
  const hasSyncedLocalRef = useRef(false);

  const idToIndex = useMemo(() => {
    const map = new Map<string, number>();
    cards.forEach((c, i) => map.set(c.id, i));
    return map;
  }, [cards]);

  useEffect(() => {
    if (!lessonSlug) return;
    const next = new Set<string>();
    (user?.lessonCompletions?.[lessonSlug] ?? []).forEach((id) => {
      if (typeof id === "string") {
        next.add(id);
      }
    });
    (localProgress.lessonCompletions?.[lessonSlug] ?? []).forEach((id) => {
      if (typeof id === "string") {
        next.add(id);
      }
    });
    setCompletedCardIds(next);
  }, [user, lessonSlug, localProgress]);

  const syncLocalProgress = useCallback(
    async (progress: LocalProgress) => {
      if (!user || !token) return;
      const updatedCompletions: Record<string, string[]> = {
        ...user.lessonCompletions,
      };
      let newCardCount = 0;

      Object.entries(progress.lessonCompletions).forEach(([slugKey, ids]) => {
        if (!Array.isArray(ids) || ids.length === 0) return;
        const existing = new Set(updatedCompletions[slugKey] ?? []);
        const additions = ids.filter((id) => typeof id === "string" && !existing.has(id));
        if (additions.length > 0) {
          updatedCompletions[slugKey] = [...existing, ...additions];
          newCardCount += additions.length;
        }
      });

      if (newCardCount === 0) {
        if (hasLocalData(progress)) {
          const cleared: LocalProgress = {
            points: 0,
            lessonCompletions: {},
            studyStreak: 0,
            lastStudyDate: null,
          };
          setLocalProgress(cleared);
          persistLocalProgress(cleared);
          setDisplayPoints(user.points ?? 0);
          setDisplayStreak(user.studyStreak ?? 0);
        }
        return;
      }

      const updatedPoints = (user.points ?? 0) + newCardCount * 10;
      const progressStreak = Math.max(0, Math.floor(progress.studyStreak));
      const progressLastDate = progress.lastStudyDate ?? null;
      const progressTimestamp = toUtcTimestamp(progressLastDate);
      const userTimestamp = toUtcTimestamp(user.lastStudyDate ?? null);
      let nextStreak = user.studyStreak ?? 0;
      let nextLastStudyDate = user.lastStudyDate ?? null;

      if (progressTimestamp !== null) {
        const shouldAdoptStreak =
          progressStreak > 0 &&
          (userTimestamp === null ||
            progressTimestamp > userTimestamp ||
            progressStreak > (user.studyStreak ?? 0));

        if (shouldAdoptStreak) {
          nextStreak = progressStreak;
          nextLastStudyDate = progressLastDate;
        } else if (userTimestamp === null || progressTimestamp > userTimestamp) {
          nextLastStudyDate = progressLastDate;
        }
      }

      try {
        await strapiFetch(`/api/users/${user.id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            points: updatedPoints,
            lessonCompletions: updatedCompletions,
            studyStreak: nextStreak,
            lastStudyDate: nextLastStudyDate,
          }),
        });
        updateUser((prev) =>
          prev
            ? {
                ...prev,
                points: updatedPoints,
                lessonCompletions: updatedCompletions,
                studyStreak: nextStreak,
                lastStudyDate: nextLastStudyDate,
              }
            : prev,
        );
        setDisplayPoints(updatedPoints);
        setDisplayStreak(nextStreak);
        const cleared: LocalProgress = {
          points: 0,
          lessonCompletions: {},
          studyStreak: 0,
          lastStudyDate: null,
        };
        setLocalProgress(cleared);
        persistLocalProgress(cleared);
      } catch (error) {
        console.error("Failed to sync stored lesson progress", error);
        hasSyncedLocalRef.current = false;
      }
    },
    [token, updateUser, user],
  );

  useEffect(() => {
    if (user && token) {
      const hasLocal = hasLocalData(localProgress);
      if (hasLocal && !hasSyncedLocalRef.current) {
        hasSyncedLocalRef.current = true;
        syncLocalProgress(localProgress);
      } else if (!hasLocal) {
        setDisplayPoints(user.points ?? 0);
        setDisplayStreak(user.studyStreak ?? 0);
      }
      setShowLoginPrompt(false);
    } else if (!user) {
      hasSyncedLocalRef.current = false;
      setDisplayPoints(localProgress.points);
      setDisplayStreak(localProgress.studyStreak);
    }
  }, [user, token, localProgress, syncLocalProgress]);

  useEffect(() => {
    setChrome(progressRef.current?.offsetHeight ?? 0);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handle = () => {
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setIndex(i);
    };
    el.addEventListener("scroll", handle, { passive: true });
    return () => el.removeEventListener("scroll", handle);
  }, []);

  const ease = useRef(createBezier(0.22, 1, 0.36, 1)).current;

  const animateScroll = useCallback(
    (targetIndex: number) => {
      const el = containerRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(total - 1, targetIndex));
      const start = el.scrollLeft;
      const width = el.clientWidth;
      const target = clamped * width;
      if (reduceMotion) {
        el.scrollLeft = target;
        setIndex(clamped);
        return;
      }
      const duration = 400;
      const startTime = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = ease(t);
        el.scrollLeft = start + (target - start) * eased;
        if (t < 1) requestAnimationFrame(step);
        else setIndex(clamped);
      };
      requestAnimationFrame(step);
    },
    [total, reduceMotion, ease]
  );

  const prev = () => animateScroll(index - 1);
  const next = () => animateScroll(index + 1);
  const goToCardById = useCallback(
    (id: string) => {
      const idx = idToIndex.get(id);
      if (idx !== undefined) {
        animateScroll(idx);
      }
    },
    [idToIndex, animateScroll]
  );

  const scrollToColumnTop = useCallback(() => {
    if (typeof window === "undefined") return;
    const column = columnRef.current;
    if (!column) return;
    const rect = column.getBoundingClientRect();
    const top = Math.max(0, window.scrollY + rect.top - 24);
    window.scrollTo({
      top,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [reduceMotion]);

  const handleCardCompletion = useCallback(
    (cardId: string) => {
      if (!lessonSlug) return;
      if (completedCardIds.has(cardId)) {
        if (index < total - 1) {
          animateScroll(index + 1);
          scrollToColumnTop();
        }
        return;
      }

      setCompletedCardIds((prevSet) => {
        const nextSet = new Set(prevSet);
        nextSet.add(cardId);
        return nextSet;
      });

      if (user && token) {
        setShowLoginPrompt(false);
        let updatedPoints = user.points ?? 0;
        let updatedCompletions: Record<string, string[]> | null = null;
        let updatedStreak = user.studyStreak ?? 0;
        let updatedLastStudyDate = user.lastStudyDate ?? null;
        updateUser((prev) => {
          if (!prev) return prev;
          const existing = prev.lessonCompletions?.[lessonSlug] ?? [];
          if (existing.includes(cardId)) {
            updatedPoints = prev.points ?? 0;
            updatedStreak = prev.studyStreak ?? 0;
            updatedLastStudyDate = prev.lastStudyDate ?? null;
            return prev;
          }
          const nextLesson = [...existing, cardId];
          updatedPoints = (prev.points ?? 0) + 10;
          updatedCompletions = {
            ...prev.lessonCompletions,
            [lessonSlug]: nextLesson,
          };
          const streakResult = calculateNextStudyStreak(prev.studyStreak, prev.lastStudyDate);
          updatedStreak = streakResult.streak;
          updatedLastStudyDate = streakResult.lastStudyDate;
          return {
            ...prev,
            points: updatedPoints,
            lessonCompletions: updatedCompletions,
            studyStreak: updatedStreak,
            lastStudyDate: updatedLastStudyDate,
          };
        });
        if (updatedCompletions) {
          setDisplayPoints(updatedPoints);
          setDisplayStreak(updatedStreak);
          (async () => {
            try {
              await strapiFetch(`/api/users/${user.id}`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  points: updatedPoints,
                  lessonCompletions: updatedCompletions,
                  studyStreak: updatedStreak,
                  lastStudyDate: updatedLastStudyDate,
                }),
              });
            } catch (error) {
              console.error("Failed to save lesson progress", error);
            }
          })();
        }
      } else {
        let updatedProgress: LocalProgress | null = null;
        setLocalProgress((prevState) => {
          const existing = prevState.lessonCompletions[lessonSlug] ?? [];
          if (existing.includes(cardId)) {
            updatedProgress = null;
            return prevState;
          }
          const nextLesson = [...existing, cardId];
          const streakResult = calculateNextStudyStreak(prevState.studyStreak, prevState.lastStudyDate);
          updatedProgress = {
            points: prevState.points + 10,
            lessonCompletions: {
              ...prevState.lessonCompletions,
              [lessonSlug]: nextLesson,
            },
            studyStreak: streakResult.streak,
            lastStudyDate: streakResult.lastStudyDate,
          };
          return updatedProgress;
        });
        if (updatedProgress) {
          persistLocalProgress(updatedProgress);
          setDisplayPoints(updatedProgress.points);
          setDisplayStreak(updatedProgress.studyStreak);
          setShowLoginPrompt(true);
        }
      }

      if (index < total - 1) {
        animateScroll(index + 1);
        scrollToColumnTop();
      }
    },
    [
      animateScroll,
      completedCardIds,
      index,
      lessonSlug,
      scrollToColumnTop,
      token,
      total,
      updateUser,
      user,
    ]
  );

  const handleSelect = (id: string) => {
    goToCardById(id);
    setTocOpen(false);
    const delay = reduceMotion ? 0 : 400;
    setTimeout(() => {
      const el = document.getElementById(`card-title-${id}`);
      el?.focus();
    }, delay);
  };

  const percent = total > 0 ? Math.round(((index + 1) / total) * 100) : 0;
  const activeCardId = cards[index]?.id;

  const registerCardWrapper = useCallback(
    (id: string) => (node: HTMLDivElement | null) => {
      if (node) {
        cardWrappers.current.set(id, node);
      } else {
        cardWrappers.current.delete(id);
      }
    },
    []
  );

  useEffect(() => {
    const activeId = activeCardId;
    if (!activeId) {
      setNavHeight(null);
      return;
    }
    const cardEl = cardWrappers.current.get(activeId);
    if (!cardEl) {
      setNavHeight(null);
      return;
    }

    const updateHeight = () => {
      const cardHeight = cardEl.offsetHeight;
      const progressHeight = progressContainerRef.current?.offsetHeight ?? 0;
      let gap = 0;
      if (columnRef.current && typeof window !== "undefined") {
        const styles = window.getComputedStyle(columnRef.current);
        gap = parseFloat(styles.rowGap || "0");
      }
      setNavHeight(cardHeight + progressHeight + gap);
    };

    updateHeight();

    const observers: ResizeObserver[] = [];

    if (typeof ResizeObserver !== "undefined") {
      const cardObserver = new ResizeObserver(updateHeight);
      cardObserver.observe(cardEl);
      observers.push(cardObserver);

      if (progressContainerRef.current) {
        const progressObserver = new ResizeObserver(updateHeight);
        progressObserver.observe(progressContainerRef.current);
        observers.push(progressObserver);
      }

      return () => {
        observers.forEach((observer) => observer.disconnect());
      };
    }

    window.addEventListener("resize", updateHeight);
    return () => {
      window.removeEventListener("resize", updateHeight);
    };
  }, [activeCardId, cards]);

  useEffect(() => {
    if (!tocOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const focusables = Array.from(
      drawer.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setTocOpen(false);
        toggleRef.current?.focus();
      } else if (e.key === "Tab") {
        if (focusables.length === 0) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = focusables.indexOf(document.activeElement as HTMLElement);
        const nextIdx =
          e.key === "ArrowDown"
            ? (idx + 1) % focusables.length
            : (idx - 1 + focusables.length) % focusables.length;
        focusables[nextIdx].focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        first?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        last?.focus();
      }
    };

    drawer.addEventListener("keydown", handleKey);
    return () => drawer.removeEventListener("keydown", handleKey);
  }, [tocOpen]);

  const tocContent = (
    <div className="space-y-6 text-neutral-900 dark:text-neutral-100">
      {modules.map((m) => (
        <div key={m.id} className="space-y-4">
          <p className="font-semibold">{m.name}</p>
          <div className="space-y-4">
            {m.topics.map((t) => (
              <div key={t.id} className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  <ChevronRight className="text-brand" />
                  <b><span>{t.name}</span></b>
                </div>
                <ul className="space-y-1 pl-6">
                  {t.cards.map((c) => {
                    const isActive = activeCardId === c.id;
                    const cardIndex = idToIndex.get(c.id);
                    const isCompleted =
                      completedCardIds.has(c.id) ||
                      (!c.quiz && cardIndex !== undefined && cardIndex < index);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          aria-current={isActive ? "true" : undefined}
                          className={[
                            "text-left w-full px-2 py-1 rounded focus:outline-none focus-visible:ring-2 ring-brand text-sm transition-colors",
                            "text-neutral-900 dark:text-neutral-100",
                            isActive
                              ? "bg-neutral-100 dark:bg-neutral-800"
                              : "hover:bg-neutral-100 dark:hover:bg-neutral-800/60",
                          ].join(" ")}
                          onClick={() => handleSelect(c.id)}
                        >
                          <span className="flex items-center gap-2">
                            <span className="flex w-4 justify-center">
                              {isCompleted ? (
                                <Check className="h-4 w-4 text-brand" aria-hidden="true" />
                              ) : null}
                            </span>
                            <span>{c.title}</span>
                            {isCompleted ? <span className="sr-only">(completed)</span> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div
        className="lg:flex lg:items-start"
        style={{ "--chrome": `${chrome}px` } as React.CSSProperties}
      >
      <div
        ref={columnRef}
        className="lg:w-2/3 lg:pr-4 flex flex-col gap-4"
      >
        <div ref={progressContainerRef} className="flex items-center">
          <div
            ref={progressRef}
            className="h-2 flex-1 bg-neutral-200 rounded overflow-hidden"
            role="progressbar"
            aria-label={`Lesson ${index + 1} of ${total} (${percent}%)`}
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={index + 1}
          >
            <div className="h-full bg-brand" style={{ width: `${percent}%` }} />
          </div>
          <span className="ml-2 text-sm">{percent}%</span>
        </div>
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setTocOpen((o) => !o)}
          className="block w-full text-lg font-large border-2 border-brand bg-white text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100 py-2 rounded focus:outline-none focus-visible:ring-2 ring-brand lg:hidden"
          aria-controls="toc-drawer"
          aria-expanded={tocOpen}
        >
          Course Content
        </button>
        <div className="relative lg:flex-1 lg:min-h-0">
          <div
            ref={containerRef}
            className="flex overflow-x-auto snap-x snap-mandatory lg:h-full"
          >
            {cards.map((c) => (
              <div
                key={c.id}
                className="w-full flex-shrink-0 snap-start lg:flex lg:h-full lg:flex-col"
              >
                <div ref={registerCardWrapper(c.id)}>
                  <Card
                    card={c}
                    topicName={c.topicName}
                    onQuizComplete={() => handleCardCompletion(c.id)}
                    quizCompleted={completedCardIds.has(c.id)}
                  />
                </div>
              </div>
            ))}
          </div>
          {index > 0 && (
            <button
              onClick={prev}
              aria-label="Previous"
              className={[
                "hidden lg:flex items-center justify-center absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full",
                "w-10 h-10 bg-white border rounded-full shadow",
              ].join(" ")}
            >
              <ChevronLeft />
            </button>
          )}
          {index < total - 1 && (
            <button
              onClick={next}
              aria-label="Next"
              className={[
                "hidden lg:flex items-center justify-center absolute right-0 top-1/2 -translate-y-1/2 translate-x-full",
                "w-10 h-10 bg-white border rounded-full shadow",
              ].join(" ")}
            >
              <ChevronRight />
            </button>
          )}
          <div
            id="toc-drawer"
            ref={drawerRef}
            role="dialog"
            aria-labelledby="course-title-mobile"
            className={`lg:hidden absolute inset-0 z-10 bg-white dark:bg-neutral-900 overflow-y-auto p-4 ${
              reduceMotion ? "" : "transition duration-200 ease-out transform"
            } ${
              tocOpen
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-2 pointer-events-none"
            }`}
          >
            <div className="sticky top-0 bg-white dark:bg-neutral-900 pb-3">
              <h2
                id="course-title-mobile"
                className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
              >
                {courseTitle || "Course Content"}
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Course Content
              </p>
            </div>
            {tocContent}
          </div>
        </div>
      </div>
      <nav
        className="hidden lg:flex lg:w-1/3 lg:pl-4 bg-white dark:bg-neutral-900"
        style={
          navHeight
            ? { height: navHeight, maxHeight: navHeight }
            : undefined
        }
        aria-labelledby="course-title-desktop"
      >
        <div className="flex h-full w-full flex-col min-h-0">
          <div className="space-y-1 shrink-0">
            <h2
              id="course-title-desktop"
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {courseTitle || "Course Content"}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Course Content
            </p>
          </div>
          <div className="mt-4 flex-1 overflow-y-auto pr-2 lg:min-h-0">
            {tocContent}
          </div>
        </div>
      </nav>
      </div>
      <LessonPointsCounter
        points={displayPoints}
        studyStreak={displayStreak}
        isLoggedIn={Boolean(user)}
        showLoginPrompt={showLoginPrompt}
        onDismissPrompt={() => setShowLoginPrompt(false)}
      />
    </>
  );
}
