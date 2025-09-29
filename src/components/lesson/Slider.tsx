import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { CSSProperties } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type {
  LessonCard,
  Module,
  Topic as LessonPlanTopic,
} from "../../types/lesson-plan";
import Card from "./Card";
import { strapiFetch } from "../../api/strapi-client";
import { useAuth } from "../../context/AuthContext";
import LessonPointsCounter from "./LessonPointsCounter";
import LessonTour, { type LessonTourStep } from "./LessonTour";
import CustomizeDialog from "./CustomizeDialog";
import type { QuizCompletionMeta } from "./Quiz";
import {
  calculateNextStudyStreak,
  normalizeCardId,
  normalizeLessonCompletionList,
  type LocalProgress,
  persistLocalProgress,
  readLocalProgress,
} from "../../utils/localProgress";
import {
  buildPersonalizedFlatPlan,
  type FlatPlan,
  type SurveyAnswers,
  type Topic as PlanTopic,
} from "../../utils/buildPersonalizedFlatPlan";
import { getTopicCategory } from "../../utils/topicCategories";
import { useTranslation } from "react-i18next";

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

const clampPoints = (value: number) => Math.max(0, value);
const LESSON_TOUR_STORAGE_KEY = "lessonPlanTourSeen";

const getModuleId = (module: Module, moduleIndex: number) =>
  module?.id != null ? String(module.id) : `module-${moduleIndex}`;

const getModuleTitle = (module: Module, moduleIndex: number) =>
  typeof module?.name === "string" && module.name.length > 0
    ? module.name
    : `Module ${moduleIndex + 1}`;

const getTopicId = (
  topic: LessonPlanTopic | undefined,
  moduleId: string,
  moduleIndex: number,
  topicIndex: number,
) => (topic?.id != null ? String(topic.id) : `${moduleId}-topic-${topicIndex}`);

const getTopicTitle = (
  topic: LessonPlanTopic | undefined,
  moduleIndex: number,
  topicIndex: number,
) =>
  typeof topic?.name === "string" && topic.name.length > 0
    ? topic.name
    : `Topic ${moduleIndex + 1}.${topicIndex + 1}`;

export default function Slider({
  cards,
  modules,
  courseTitle,
  lessonSlug,
}: {
  cards: LessonCard[];
  modules: Module[];
  courseTitle?: string;
  lessonSlug?: string;
}) {
  const { t, i18n } = useTranslation();
  const [index, setIndex] = useState(0);
  const [displayCards, setDisplayCards] = useState<LessonCard[]>(cards);
  const displayCardsRef = useRef(displayCards);
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
  const skipScrollOnVideoRef = useRef(false);
  const [navHeight, setNavHeight] = useState<number | null>(null);
  const { user, token, updateUser } = useAuth();
  const initialLocalProgress = useMemo(() => readLocalProgress(), []);
  const [localProgress, setLocalProgress] = useState<LocalProgress>(initialLocalProgress);
  const [displayPoints, setDisplayPoints] = useState<number>(
    () => clampPoints(user?.points ?? initialLocalProgress.points ?? 0),
  );
  const [displayStreak, setDisplayStreak] = useState<number>(
    () => user?.studyStreak ?? initialLocalProgress.studyStreak ?? 0,
  );
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [surveyAnswers, setSurveyAnswers] = useState<SurveyAnswers | null>(null);
  const [personalizedPlan, setPersonalizedPlan] = useState<FlatPlan | null>(null);
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

  const topicCardIdsMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    modules.forEach((module) => {
      module.topics.forEach((topic) => {
        const ids = new Set<string>();
        topic.cards.forEach((topicCard) => {
          const normalized = toCardKey(topicCard.id);
          if (normalized) {
            ids.add(normalized);
          }
        });
        map.set(topic.id, ids);
      });
    });
    return map;
  }, [modules, toCardKey]);

  const moduleCardIdsMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    modules.forEach((module) => {
      const ids = new Set<string>();
      module.topics.forEach((topic) => {
        topic.cards.forEach((topicCard) => {
          const normalized = toCardKey(topicCard.id);
          if (normalized) {
            ids.add(normalized);
          }
        });
      });
      map.set(module.id, ids);
    });
    return map;
  }, [modules, toCardKey]);

  const planTopics = useMemo<PlanTopic[]>(() => {
    const result: PlanTopic[] = [];
    modules.forEach((module, moduleIndex) => {
      const moduleTopics = Array.isArray(module.topics) ? module.topics : [];
      const moduleId = getModuleId(module, moduleIndex);
      const moduleTitle = getModuleTitle(module, moduleIndex);
      moduleTopics.forEach((topic, topicIndex) => {
        const topicId = getTopicId(topic, moduleId, moduleIndex, topicIndex);
        const topicTitle = getTopicTitle(topic, moduleIndex, topicIndex);
        result.push({
          id: topicId,
          title: topicTitle,
          categoryId: getTopicCategory(topicId),
          originalOrder: result.length,
          moduleId,
          moduleTitle,
        });
      });
    });
    return result;
  }, [modules]);

  const cardsByTopic = useMemo(() => {
    const map = new Map<string, LessonCard[]>();
    modules.forEach((module, moduleIndex) => {
      const moduleTopics = Array.isArray(module.topics) ? module.topics : [];
      const moduleId = getModuleId(module, moduleIndex);
      moduleTopics.forEach((topic, topicIndex) => {
        const topicId = getTopicId(topic, moduleId, moduleIndex, topicIndex);
        const topicCards = Array.isArray(topic?.cards)
          ? (topic.cards as LessonCard[])
          : [];
        map.set(topicId, topicCards);
      });
    });
    return map;
  }, [modules]);

  const topicsById = useMemo(
    () => {
      const map = new Map<
        string,
        {
          topic: LessonPlanTopic | undefined;
          moduleTitle: string;
          moduleId: string;
          topicTitle: string;
        }
      >();

      modules.forEach((module, moduleIndex) => {
        const moduleTopics = Array.isArray(module.topics) ? module.topics : [];
        const moduleId = getModuleId(module, moduleIndex);
        const moduleTitle = getModuleTitle(module, moduleIndex);

        moduleTopics.forEach((topic, topicIndex) => {
          const topicId = getTopicId(topic, moduleId, moduleIndex, topicIndex);
          map.set(topicId, {
            topic,
            moduleTitle,
            moduleId,
            topicTitle: getTopicTitle(topic, moduleIndex, topicIndex),
          });
        });
      });

      return map;
    },
    [modules],
  );

  const personalizedTocTopics = useMemo(() => {
    if (!personalizedPlan) return null;

    const seen = new Set<string>();
    const ordered: {
      topicId: string;
      topic: LessonPlanTopic | undefined;
      moduleTitle: string;
      topicTitle: string;
    }[] = [];

    personalizedPlan.topics.forEach((planTopic) => {
      const entry = topicsById.get(planTopic.id);
      if (!entry || seen.has(planTopic.id)) return;

      ordered.push({
        topicId: planTopic.id,
        topic: entry.topic,
        moduleTitle: entry.moduleTitle,
        topicTitle: entry.topicTitle,
      });
      seen.add(planTopic.id);
    });

    modules.forEach((module, moduleIndex) => {
      const moduleTopics = Array.isArray(module.topics) ? module.topics : [];
      const moduleId = getModuleId(module, moduleIndex);
      moduleTopics.forEach((topic, topicIndex) => {
        const topicId = getTopicId(topic, moduleId, moduleIndex, topicIndex);
        if (seen.has(topicId)) return;
        const entry = topicsById.get(topicId);
        if (!entry) return;
        ordered.push({
          topicId,
          topic: entry.topic,
          moduleTitle: entry.moduleTitle,
          topicTitle: entry.topicTitle,
        });
        seen.add(topicId);
      });
    });

    return ordered;
  }, [modules, personalizedPlan, topicsById]);

  const tourSteps = useMemo<LessonTourStep[]>(
    () => [
      {
        id: "course-navigation",
        title: t("lesson.tour.steps.courseNavigation.title"),
        description: t("lesson.tour.steps.courseNavigation.description"),
        target: {
          desktop: '[data-tour-id="course-nav"]',
          mobile: '[data-tour-id="course-content-toggle"]',
        },
      },
      {
        id: "lesson-flow",
        title: t("lesson.tour.steps.lessonFlow.title"),
        description: t("lesson.tour.steps.lessonFlow.description"),
        target: {
          all: '[data-tour-id="lesson-flow"]',
        },
      },
      {
        id: "points-and-streaks",
        title: t("lesson.tour.steps.pointsAndStreaks.title"),
        description: t("lesson.tour.steps.pointsAndStreaks.description"),
        target: {
          desktop: '[data-tour-id="points-hud-desktop"]',
          mobile: '[data-tour-id="points-hud-mobile"]',
        },
      },
      {
        id: "save-progress",
        title: t("lesson.tour.steps.saveProgress.title"),
        description: t("lesson.tour.steps.saveProgress.description"),
        target: {
          desktop: '[data-tour-id="hud-auth-desktop"]',
          mobile: '[data-tour-id="hud-auth-mobile"]',
        },
      },
      {
        id: "customize",
        title: t("lesson.tour.steps.customize.title"),
        description: t("lesson.tour.steps.customize.description"),
        target: {
          desktop: '[data-tour-id="lesson-customize-desktop"]',
          mobile: '[data-tour-id="lesson-customize-mobile"]',
        },
      },
    ],
    [t, i18n.language],
  );

  const calculateCompletionBonus = useCallback(
    (card: LessonCard, previous: string[], next: string[]) => {
      let bonus = 0;
      const previousSet = new Set(previous);
      const nextSet = new Set(next);

      const topicCardIds = topicCardIdsMap.get(card.topicId);
      if (topicCardIds && topicCardIds.size > 0) {
        const wasTopicComplete = Array.from(topicCardIds).every((id) => previousSet.has(id));
        const isTopicComplete = Array.from(topicCardIds).every((id) => nextSet.has(id));
        if (!wasTopicComplete && isTopicComplete) {
          bonus += 50;
        }
      }

      const moduleCardIds = moduleCardIdsMap.get(card.moduleId);
      if (moduleCardIds && moduleCardIds.size > 0) {
        const wasModuleComplete = Array.from(moduleCardIds).every((id) => previousSet.has(id));
        const isModuleComplete = Array.from(moduleCardIds).every((id) => nextSet.has(id));
        if (!wasModuleComplete && isModuleComplete) {
          bonus += 500;
        }
      }

      return bonus;
    },
    [moduleCardIdsMap, topicCardIdsMap],
  );

  useEffect(() => {
    displayCardsRef.current = displayCards;
  }, [displayCards]);

  useEffect(() => {
    setDisplayCards(cards);
    displayCardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    if (!customizeOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCustomizeOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [customizeOpen]);

  useEffect(() => {
    if (displayCards.length === 0) return;

    const firstIncompleteIndex = displayCards.findIndex((card) => {
      const cardKey = toCardKey(card.id);
      return !completedCardIds.has(cardKey);
    });

    const targetIndex = firstIncompleteIndex === -1 ? 0 : firstIncompleteIndex;

    setIndex((prev) => (prev === targetIndex ? prev : targetIndex));

    const container = containerRef.current;
    if (container) {
      const width = container.clientWidth || container.offsetWidth || 0;
      container.scrollLeft = targetIndex * width;
    }
  }, [displayCards, completedCardIds, toCardKey]);

  const total = displayCards.length;

  const idToIndex = useMemo(() => {
    const map = new Map<string, number>();
    displayCards.forEach((c, i) => map.set(toCardKey(c.id), i));
    return map;
  }, [displayCards, toCardKey]);

  const handleCustomizeSubmit = useCallback(
    (answers: SurveyAnswers) => {
      setSurveyAnswers(answers);
      const plan = buildPersonalizedFlatPlan(answers, planTopics);
      setPersonalizedPlan(plan);

      const nextCards: LessonCard[] = [];
      const seenTopics = new Set<string>();

      plan.topics.forEach((topic) => {
        seenTopics.add(topic.id);
        const topicCards = cardsByTopic.get(topic.id);
        if (topicCards && topicCards.length > 0) {
          nextCards.push(...topicCards);
        }
      });

      if (nextCards.length < cards.length) {
        planTopics.forEach((topic) => {
          if (seenTopics.has(topic.id)) return;
          const topicCards = cardsByTopic.get(topic.id);
          if (topicCards && topicCards.length > 0) {
            nextCards.push(...topicCards);
          }
        });
      }

      if (nextCards.length === 0) {
        setDisplayCards(cards);
        displayCardsRef.current = cards;
      } else {
        setDisplayCards(nextCards);
        displayCardsRef.current = nextCards;
      }

      setCustomizeOpen(false);
    },
    [cards, cardsByTopic, planTopics],
  );

  const handleCustomizeRevert = useCallback(() => {
    setSurveyAnswers(null);
    setPersonalizedPlan(null);
    setDisplayCards(cards);
    displayCardsRef.current = cards;
    setCustomizeOpen(false);
  }, [cards]);

  const applyPointDelta = useCallback(
    (delta: number) => {
      if (delta === 0) return;
      if (user && token) {
        let updatedPoints: number | null = null;
        updateUser((prev) => {
          if (!prev) return prev;
          const nextPoints = clampPoints((prev.points ?? 0) + delta);
          updatedPoints = nextPoints;
          return { ...prev, points: nextPoints };
        });
        if (updatedPoints !== null) {
          const safePoints = clampPoints(updatedPoints);
          setDisplayPoints(safePoints);
          setLocalProgress((prevState) => {
            const nextProgress = { ...prevState, points: safePoints };
            persistLocalProgress(nextProgress);
            return nextProgress;
          });
          (async () => {
            try {
              await strapiFetch(`/api/users/${user.id}`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` },
                body: JSON.stringify({ points: safePoints }),
              });
            } catch (error) {
              console.error("Failed to update points", error);
            }
          })();
        }
      } else {
        let updatedProgress: LocalProgress | null = null;
        setLocalProgress((prevState) => {
          const nextPoints = clampPoints(prevState.points + delta);
          const nextProgress = { ...prevState, points: nextPoints };
          persistLocalProgress(nextProgress);
          updatedProgress = nextProgress;
          return nextProgress;
        });
        if (updatedProgress) {
          setDisplayPoints(updatedProgress.points);
        }
      }
    },
    [token, updateUser, user],
  );

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
      setDisplayPoints(clampPoints(user.points ?? 0));
      setDisplayStreak(user.studyStreak ?? 0);
      setShowLoginPrompt(false);
    } else {
      setDisplayPoints(clampPoints(localProgress.points));
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
      const totalCards = displayCardsRef.current.length;
      const clamped = Math.max(0, Math.min(totalCards - 1, targetIndex));
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
    [reduceMotion, ease]
  );

  const prev = () => {
    void animateScroll(index - 1);
  };
  const next = useCallback(() => {
    void animateScroll(index + 1);
  }, [animateScroll, index]);
  const goToCardById = useCallback(
    (id: string) => {
      const idx = idToIndex.get(id);
      if (idx === undefined) {
        return;
      }
      void animateScroll(idx);
    },
    [animateScroll, idToIndex]
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

  const handleCardResult = useCallback(
    (card: LessonCard, meta?: QuizCompletionMeta) => {
      if (!lessonSlug) return;

      const normalizedId = toCardKey(card.sourceCardId ?? card.id);
      const result = meta?.result
        ?? (card.quiz?.type === "multiple_choice" ? "correct" : "revealed");
      const currentIndex = index;

      const skipScroll =
        skipScrollOnVideoRef.current || meta?.preventScroll || meta?.result === "video_complete";
      if (skipScrollOnVideoRef.current) {
        skipScrollOnVideoRef.current = false;
      }
      const shouldScroll = !skipScroll;

      const advance = () => {
        const totalCards = displayCardsRef.current.length;
        if (currentIndex < totalCards - 1) {
          void animateScroll(currentIndex + 1).then(() => {
            if (shouldScroll) {
              scrollToColumnTop();
            }
          });
        }
      };

      const scheduleAdvance = () => {
        if (meta?.suppressAutoAdvance) {
          return;
        }
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

      if (result === "incorrect" && card.quiz?.type === "multiple_choice") {
        applyPointDelta(-10);
        setShowLoginPrompt(false);
      } else if (normalizedId && !completedCardIds.has(normalizedId)) {
        setCompletedCardIds((prevSet) => {
          const nextSet = new Set(prevSet);
          nextSet.add(normalizedId);
          return nextSet;
        });

        if (user && token) {
          setShowLoginPrompt(false);
          let updatedPoints = clampPoints(user.points ?? 0);
          let updatedCompletions: Record<string, string[]> | null = null;
          let updatedStreak = user.studyStreak ?? 0;
          let updatedLastStudyDate = user.lastStudyDate ?? null;
          let nextLessonCompletions: string[] | null = null;
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
            nextLessonCompletions = nextLesson;
            const awardedPoints = 10 + calculateCompletionBonus(card, existing, nextLesson);
            updatedPoints = clampPoints((prev.points ?? 0) + awardedPoints);
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
            const safePoints = clampPoints(updatedPoints);
            setDisplayPoints(safePoints);
            setDisplayStreak(updatedStreak);
            setLocalProgress((prevState) => {
              const nextProgress: LocalProgress = {
                points: safePoints,
                lessonCompletions: {
                  ...prevState.lessonCompletions,
                  [lessonSlug]: nextLessonCompletions
                    ? nextLessonCompletions
                    : normalizeLessonCompletionList(
                        prevState.lessonCompletions[lessonSlug] ?? [],
                      ),
                },
                studyStreak: updatedStreak,
                lastStudyDate: updatedLastStudyDate,
              };
              persistLocalProgress(nextProgress);
              return nextProgress;
            });
            (async () => {
              try {
                await strapiFetch(`/api/users/${user.id}`, {
                  method: "PUT",
                  headers: { Authorization: `Bearer ${token}` },
                  body: JSON.stringify({
                    points: safePoints,
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
            const streakResult = calculateNextStudyStreak(
              prevState.studyStreak,
              prevState.lastStudyDate,
            );
            const awardedPoints = 10 + calculateCompletionBonus(card, existing, nextLesson);
            const nextPoints = clampPoints(prevState.points + awardedPoints);
            const nextProgress: LocalProgress = {
              points: nextPoints,
              lessonCompletions: {
                ...prevState.lessonCompletions,
                [lessonSlug]: nextLesson,
              },
              studyStreak: streakResult.streak,
              lastStudyDate: streakResult.lastStudyDate,
            };
            persistLocalProgress(nextProgress);
            updatedProgress = nextProgress;
            return nextProgress;
          });
          if (updatedProgress) {
            setDisplayPoints(updatedProgress.points);
            setDisplayStreak(updatedProgress.studyStreak);
            setShowLoginPrompt(true);
          }
        }
      }

      scheduleAdvance();
    },
    [
      animateScroll,
      applyPointDelta,
      completedCardIds,
      index,
      lessonSlug,
      scrollToColumnTop,
      token,
      toCardKey,
      updateUser,
      user,
    ],
  );

  const handleVideoPlay = useCallback((_: LessonCard) => {
    skipScrollOnVideoRef.current = true;
  }, []);

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
  const activeCardId = displayCards[index] ? toCardKey(displayCards[index].id) : undefined;
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
  }, [activeCardId, displayCards]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!cards.length) return;
    const seen = window.localStorage.getItem(LESSON_TOUR_STORAGE_KEY);
    if (seen) return;
    const timer = window.setTimeout(() => setTourOpen(true), 600);
    return () => window.clearTimeout(timer);
  }, [cards.length]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (tourOpen) {
      root.classList.add("lesson-tour-active");
    } else {
      root.classList.remove("lesson-tour-active");
    }
    return () => {
      root.classList.remove("lesson-tour-active");
    };
  }, [tourOpen]);

  const handleTourDismiss = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LESSON_TOUR_STORAGE_KEY, "true");
    }
    setTourOpen(false);
  }, []);

  const columnClassNames = ["flex flex-col gap-4", "lg:w-2/3 lg:pr-4"].join(" ");
  const navStyle =
    navHeight != null ? { height: navHeight, maxHeight: navHeight } : undefined;

  const renderTopicCards = (
    topicCards: LessonPlanTopic["cards"] | undefined,
    topicId: string,
  ) => {
    const cardsForTopic = Array.isArray(topicCards) ? topicCards : [];
    return (
      <ul className="space-y-1 pl-6">
        {cardsForTopic.map((c) => {
          const cardKey = toCardKey(c.id);
          const isActive = activeCardId === cardKey;
          const cardIndex = idToIndex.get(cardKey);
          const isCompleted =
            completedCardIds.has(cardKey) ||
            (!c.quiz && cardIndex !== undefined && cardIndex < index);
          return (
            <li key={`${topicId}-${cardKey}`}>
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
    );
  };

  const tocContent = (
    <div className="space-y-6 text-neutral-900 dark:text-neutral-100">
      {personalizedPlan && personalizedTocTopics && personalizedTocTopics.length > 0 ? (
        personalizedTocTopics.map(({ topicId, topic, moduleTitle, topicTitle }) => (
          <div key={topicId} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
              <ChevronRight className="text-brand" />
              <b>
                <span>{topicTitle}</span>
              </b>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{moduleTitle}</p>
            {renderTopicCards(topic?.cards, topicId)}
          </div>
        ))
      ) : (
        modules.map((module, moduleIndex) => {
          const moduleId = getModuleId(module, moduleIndex);
          const moduleTitle = getModuleTitle(module, moduleIndex);
          const moduleTopics = Array.isArray(module.topics) ? module.topics : [];

          return (
            <div key={moduleId} className="space-y-4">
              <p className="font-semibold">{moduleTitle}</p>
              <div className="space-y-4">
                {moduleTopics.map((topic, topicIndex) => {
                  const topicId = getTopicId(topic, moduleId, moduleIndex, topicIndex);
                  const topicTitle = getTopicTitle(topic, moduleIndex, topicIndex);

                  return (
                    <div key={topicId} className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        <ChevronRight className="text-brand" />
                        <b>
                          <span>{topicTitle}</span>
                        </b>
                      </div>
                      {renderTopicCards(topic?.cards, topicId)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <>
      <div
        className="lg:flex lg:items-start"
        style={{ "--chrome": `${chrome}px` } as CSSProperties}
      >
      <div ref={columnRef} className={columnClassNames}>
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
        <div className="relative lg:flex-1 lg:min-h-0">
          <div
            ref={containerRef}
            className="flex overflow-x-auto snap-x snap-mandatory lg:h-full"
            data-tour-id="lesson-flow"
          >
            {displayCards.map((c) => {
              const key = toCardKey(c.id);
              const isActive = key === activeCardId;
              return (
                <div
                  key={key}
                  className="w-full flex-shrink-0 snap-start lg:flex lg:h-full lg:flex-col"
                >
                  <div ref={registerCardWrapper(key)}>
                    <Card
                      card={c}
                      headerLabel={c.moduleName ?? undefined}
                      topicName={c.topicName}
                      onQuizComplete={(cardMeta, meta) => handleCardResult(cardMeta, meta)}
                      onVideoComplete={(cardMeta, meta) => handleCardResult(cardMeta, meta)}
                      onVideoPlay={handleVideoPlay}
                      onRequestNext={next}
                      quizCompleted={completedCardIds.has(
                        toCardKey(c.sourceCardId ?? c.id),
                      )}
                    />
                  </div>
                </div>
              );
            })}
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
            <div className="bg-white dark:bg-neutral-900 pb-3">
              <h2
                id="course-title-mobile"
                className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
              >
                {courseTitle || t("lesson.courseContent.title")}
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {t("lesson.courseContent.label")}
              </p>
            </div>
            {tocContent}
          </div>
        </div>
      </div>
      <nav
        className={[
          "hidden",
          "lg:flex",
          "lg:w-1/3 lg:pl-4 bg-white dark:bg-neutral-900",
        ].join(" ")}
        style={navStyle}
        aria-labelledby="course-title-desktop"
        data-tour-id="course-nav"
      >
        <div className="flex h-full w-full flex-col min-h-0">
          <div className="space-y-1 shrink-0">
            <h2
              id="course-title-desktop"
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {courseTitle || t("lesson.courseContent.title")}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t("lesson.courseContent.label")}
            </p>
          </div>
          <div className="mt-4 flex-1 overflow-y-auto pr-2 lg:min-h-0">
            {tocContent}
          </div>
        </div>
      </nav>
      </div>
      {customizeOpen && (
        <CustomizeDialog
          open={customizeOpen}
          onClose={() => setCustomizeOpen(false)}
          onSubmit={handleCustomizeSubmit}
          initialAnswers={surveyAnswers ?? undefined}
          plan={personalizedPlan}
          onRevert={personalizedPlan ? handleCustomizeRevert : undefined}
        />
      )}
      <LessonTour
        open={tourOpen}
        steps={tourSteps}
        onDismiss={handleTourDismiss}
        onComplete={handleTourDismiss}
      />
      <LessonPointsCounter
        points={displayPoints}
        studyStreak={displayStreak}
        isLoggedIn={Boolean(user)}
        showLoginPrompt={showLoginPrompt}
        onDismissPrompt={() => setShowLoginPrompt(false)}
        onToggleCourseContent={() => setTocOpen((open) => !open)}
        courseContentOpen={tocOpen}
        courseContentButtonRef={toggleRef}
        onRequestCustomize={() => setCustomizeOpen(true)}
      />
    </>
  );
}
