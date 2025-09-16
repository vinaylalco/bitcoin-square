import { Link } from "react-router-dom";

interface LessonPointsCounterProps {
  points: number;
  isLoggedIn: boolean;
  showLoginPrompt: boolean;
  onDismissPrompt: () => void;
}

export default function LessonPointsCounter({
  points,
  isLoggedIn,
  showLoginPrompt,
  onDismissPrompt,
}: LessonPointsCounterProps) {
  return (
    <div className="hidden md:flex fixed bottom-6 left-6 z-30 flex-col gap-3">
      <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white/95 px-5 py-3 shadow-lg backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/90">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Points
          </span>
          <span className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {points}
          </span>
        </div>
        {isLoggedIn ? (
          <Link
            to="/dashboard"
            className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90"
          >
            Account
          </Link>
        ) : (
          <Link
            to="/login"
            className="rounded-xl border border-brand px-3 py-2 text-sm font-semibold text-brand transition hover:bg-brand/10"
          >
            Log in
          </Link>
        )}
      </div>
      {!isLoggedIn && showLoginPrompt && (
        <div className="max-w-xs rounded-xl border border-neutral-200 bg-white/95 px-4 py-3 text-sm shadow-lg backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-100">
          <p className="mb-2 text-neutral-700 dark:text-neutral-200">
            Create an account so your points and lesson progress are saved.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/register"
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-brand/90"
            >
              Sign up
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-brand px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand transition hover:bg-brand/10"
            >
              Log in
            </Link>
            <button
              type="button"
              onClick={onDismissPrompt}
              className="ml-auto rounded-lg px-2 py-1 text-xs font-medium uppercase tracking-wide text-neutral-500 transition hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

