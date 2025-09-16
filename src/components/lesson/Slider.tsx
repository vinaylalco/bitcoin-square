import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { Card as CardType, Module } from "../../types/lesson-plan";
import Card from "./Card";
import { strapiFetch } from "../../api/strapi-client";
import { useAuth } from "../../context/AuthContext";
import LessonPointsCounter from "./LessonPointsCounter";
import type { QuizCompletionMeta } from "./Quiz";
import {
  calculateNextStudyStreak,
  normalizeCardId,
  normalizeLessonCompletionList,
  type LocalProgress,
  persistLocalProgress,
  readLocalProgress,
} from "../../utils/localProgress";

interface SliderCard extends CardType {
  topicName: string;
  moduleName: string;
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
  const toCardKey = useCallback((value: unknown) => normalizeCardId(value) ?? String(value), []);
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
  const completionTimeoutRef = useRef<number | null>(null);
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
      normalizeLessonCompletionList(user?.lessonCompletions?.[lessonSlug] ?? []).forEach((id) => {
        initial.add(id);
      });
      if (!user) {
        normalizeLessonCompletionList(
          initialLocalProgress.lessonCompletions?.[lessonSlug] ?? [],
        ).forEach((id) => {
          initial.add(id);
        });
      }
    }
    return initial;
  });

  const idToIndex = useMemo(() => {
    const map = new Map<string, number>();
    cards.forEach((c, i) => map.set(toCardKey(c.id), i));
    return map;
  }, [cards, toCardKey]);

  useEffect(() => {
    if (!lessonSlug) return;
    const next = new Set<string>();
    normalizeLessonCompletionList(user?.lessonCompletions?.[lessonSlug] ?? []).forEach((id) => {
      next.add(id);
    });
    if (!user) {
      normalizeLessonCompletionList(localProgress.lessonCompletions?.[lessonSlug] ?? []).forEach(
        (id) => {
          next.add(id);
        },
      );
    }
    setCompletedCardIds(next);
  }, [user, lessonSlug, localProgress]);

  useEffect(() => {
    if (user) {
      setDisplayPoints(user.points ?? 0);
      setDisplayStreak(user.studyStreak ?? 0);
      setShowLoginPrompt(false);
    } else {
      setDisplayPoints(localProgress.points);
      setDisplayStreak(localProgress.studyStreak);
    }
  }, [user, localProgress]);

  useEffect(() => {
    setChrome(progressRef.current?.offsetHeight ?? 0);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && completionTimeoutRef.current !== null) {
        window.clearTimeout(completionTimeoutRef.current);
      }
    };
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
      if (!el) return Promise.resolve();
      const clamped = Math.max(0, Math.min(total - 1, targetIndex));
      const start = el.scrollLeft;
      const width = el.clientWidth;
      const target = clamped * width;
      if (reduceMotion) {
        el.scrollLeft = target;
        setIndex(clamped);
        return Promise.resolve();
      }
      const duration = 400;
      const startTime = performance.now();
      return new Promise<void>((resolve) => {
        const step = (now: number) => {
          const t = Math.min((now - startTime) / duration, 1);
          const eased = ease(t);
          el.scrollLeft = start + (target - start) * eased;
          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            setIndex(clamped);
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    },
    [total, reduceMotion, ease]
  );

  const prev = () => {
    void animateScroll(index - 1);
  };
  const next = () => {
    void animateScroll(index + 1);
  };
  const goToCardById = useCallback(
    (id: string) => {
      const idx = idToIndex.get(id);
      if (idx !== undefined) {
        void animateScroll(idx);
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
    (cardId: string, meta?: QuizCompletionMeta) => {
      const normalizedId = toCardKey(cardId);
      if (!lessonSlug) return;

      const currentIndex = index;
      const advance = () => {
        if (currentIndex < total - 1) {
          void animateScroll(currentIndex + 1).then(() => {
            scrollToColumnTop();
          });
        }
      };

      const scheduleAdvance = () => {
        const delay = Math.max(0, meta?.delayMs ?? 0);
        if (typeof window !== "undefined") {
          if (completionTimeoutRef.current !== null) {
            window.clearTimeout(completionTimeoutRef.current);
          }
          if (delay > 0) {
            completionTimeoutRef.current = window.setTimeout(() => {
              advance();
              completionTimeoutRef.current = null;
            }, delay);
            return;
          }
        }
        advance();
      };

      if (completedCardIds.has(normalizedId)) {
        scheduleAdvance();
        return;
      }

      setCompletedCardIds((prevSet) => {
        const nextSet = new Set(prevSet);
        nextSet.add(normalizedId);
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
          const existing = normalizeLessonCompletionList(
            prev.lessonCompletions?.[lessonSlug] ?? [],
          );
          if (existing.includes(normalizedId)) {
            updatedPoints = prev.points ?? 0;
            updatedStreak = prev.studyStreak ?? 0;
            updatedLastStudyDate = prev.lastStudyDate ?? null;
            return prev;
          }
          const nextLesson = [...existing, normalizedId];
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
          const existing = normalizeLessonCompletionList(
            prevState.lessonCompletions[lessonSlug] ?? [],
          );
          if (existing.includes(normalizedId)) {
            updatedProgress = null;
            return prevState;
          }
          const nextLesson = [...existing, normalizedId];
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

      scheduleAdvance();
    },
    [
      animateScroll,
      completedCardIds,
      completionTimeoutRef,
      index,
      lessonSlug,
      scrollToColumnTop,
      token,
      toCardKey,
      total,
      updateUser,
      user,
    ]
  );

  const handleSelect = (id: string) => {
    const key = toCardKey(id);
    goToCardById(key);
    setTocOpen(false);
    const delay = reduceMotion ? 0 : 400;
    setTimeout(() => {
      const el = document.getElementById(`card-title-${key}`);
      el?.focus();
    }, delay);
  };

  const percent = total > 0 ? Math.round(((index + 1) / total) * 100) : 0;
  const activeCardId = cards[index] ? toCardKey(cards[index].id) : undefined;

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
                    const cardKey = toCardKey(c.id);
                    const isActive = activeCardId === cardKey;
                    const cardIndex = idToIndex.get(cardKey);
                    const isCompleted =
                      completedCardIds.has(cardKey) ||
                      (!c.quiz && cardIndex !== undefined && cardIndex < index);
                    return (
                      <li key={cardKey}>
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
                          onClick={() => handleSelect(cardKey)}
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
                key={toCardKey(c.id)}
                className="w-full flex-shrink-0 snap-start lg:flex lg:h-full lg:flex-col"
              >
                <div ref={registerCardWrapper(toCardKey(c.id))}>
                  <Card
                    card={c}
                    topicName={c.topicName}
                    onQuizComplete={(meta) => handleCardCompletion(c.id, meta)}
                    quizCompleted={completedCardIds.has(toCardKey(c.id))}
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
