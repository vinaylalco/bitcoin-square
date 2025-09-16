import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, LogIn, UserRound, Zap } from "lucide-react";
import { Link } from "react-router-dom";

interface LessonPointsCounterProps {
  points: number;
  studyStreak: number;
  isLoggedIn: boolean;
  showLoginPrompt: boolean;
  onDismissPrompt: () => void;
}

export default function LessonPointsCounter({
  points,
  studyStreak,
  isLoggedIn,
  showLoginPrompt,
  onDismissPrompt,
}: LessonPointsCounterProps) {
  const [animateStrike, setAnimateStrike] = useState(false);
  const lastPoints = useRef(points);

  useEffect(() => {
    if (typeof window === "undefined") {
      lastPoints.current = points;
      return undefined;
    }
    if (points > lastPoints.current) {
      setAnimateStrike(true);
      const timeout = window.setTimeout(() => setAnimateStrike(false), 650);
      lastPoints.current = points;
      return () => window.clearTimeout(timeout);
    }
    lastPoints.current = points;
    return undefined;
  }, [points]);

  const formattedPoints = useMemo(() => points.toLocaleString(), [points]);
  const normalizedStreak = Math.max(0, Math.floor(studyStreak));
  const streakLabel = normalizedStreak === 1 ? "day" : "days";

  return (
    <div className="hidden md:flex fixed bottom-6 left-6 z-30 flex-col gap-4 text-white">
      <div className={`points-hud ${animateStrike ? "points-hud--lightning" : ""}`}>
        <div className="points-hud__glow" aria-hidden />
        <div className="points-hud__noise" aria-hidden />
        <div className="relative z-10 flex flex-wrap items-center gap-5 px-6 py-4">
          <div className="flex items-center gap-4">
            <span className="points-hud__icon points-hud__icon--points" aria-hidden>
              <Zap className="h-4 w-4" />
            </span>
            <div>
              <span className="points-hud__label">Points</span>
              <span className={`points-hud__value ${animateStrike ? "points-hud__value--lightning" : ""}`}>
                {formattedPoints}
              </span>
            </div>
          </div>
          <div className="points-hud__divider" aria-hidden />
          <div className="flex items-center gap-4">
            <span className="points-hud__icon points-hud__icon--streak" aria-hidden>
              <Flame className="h-4 w-4" />
            </span>
            <div>
              <span className="points-hud__label">Study streak</span>
              <span className="points-hud__value text-lg">
                {normalizedStreak} {streakLabel}
              </span>
            </div>
          </div>
          <div className="ml-auto flex items-center">
            {isLoggedIn ? (
              <Link
                to="/dashboard"
                className="points-hud__account"
                aria-label="Account"
              >
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </Link>
            ) : (
              <Link
                to="/login"
                className="points-hud__login"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span className="font-medium">Log in</span>
              </Link>
            )}
          </div>
        </div>
      </div>
      {!isLoggedIn && showLoginPrompt && (
        <div className="points-hud__prompt">
          <p className="mb-3 font-medium text-neutral-900 dark:text-neutral-100">
            Create an account so your points and lesson progress are saved.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/register"
              className="points-hud__cta points-hud__cta--primary"
            >
              Sign up
            </Link>
            <Link
              to="/login"
              className="points-hud__cta points-hud__cta--ghost"
            >
              Log in
            </Link>
            <button
              type="button"
              onClick={onDismissPrompt}
              className="ml-auto text-xs font-semibold uppercase tracking-wide text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

