import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { BookOpen, Flame, LogIn, UserRound, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { usePreferences } from "../../context/PreferencesContext";

function createReverbImpulse(ctx: BaseAudioContext): AudioBuffer {
  const duration = 0.9;
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i += 1) {
    const norm = i / length;
    const decay = Math.pow(1 - norm, 3.1);
    data[i] = (Math.random() * 2 - 1) * decay * 0.55;
  }

  return buffer;
}

interface LessonPointsCounterProps {
  points: number;
  studyStreak: number;
  isLoggedIn: boolean;
  showLoginPrompt: boolean;
  onDismissPrompt: () => void;
  onToggleCourseContent?: () => void;
  courseContentOpen?: boolean;
  courseContentButtonRef?: RefObject<HTMLButtonElement>;
}

export default function LessonPointsCounter({
  points,
  studyStreak,
  isLoggedIn,
  showLoginPrompt,
  onDismissPrompt,
  onToggleCourseContent,
  courseContentOpen,
  courseContentButtonRef,
}: LessonPointsCounterProps) {
  const [animateStrike, setAnimateStrike] = useState(false);
  const lastPoints = useRef(points);
  const audioContextRef = useRef<AudioContext | null>(null);
  const thunderBufferRef = useRef<AudioBuffer | null>(null);
  const thunderDataRef = useRef<ArrayBuffer | null>(null);
  const thunderBufferCtxRef = useRef<AudioContext | null>(null);
  const thunderBufferPromiseRef = useRef<Promise<AudioBuffer> | null>(null);
  const reverbBufferRef = useRef<AudioBuffer | null>(null);

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

  useEffect(() => {
    return () => {
      const ctx = audioContextRef.current;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => undefined);
      }
      audioContextRef.current = null;
      thunderBufferRef.current = null;
      thunderBufferCtxRef.current = null;
      thunderBufferPromiseRef.current = null;
      reverbBufferRef.current = null;
    };
  }, []);

  const playThunderSound = useCallback(async () => {
    if (typeof window === "undefined") return;
    const win = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = win.AudioContext ?? win.webkitAudioContext;
    if (!AudioContextCtor) return;

    let ctx = audioContextRef.current;
    if (!ctx || ctx.state === "closed") {
      ctx = new AudioContextCtor();
      audioContextRef.current = ctx;
      thunderBufferRef.current = null;
      thunderBufferCtxRef.current = null;
      thunderBufferPromiseRef.current = null;
      reverbBufferRef.current = null;
    }
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // Ignore resume failures and attempt playback regardless
      }
    }

    try {
      if (!thunderBufferRef.current || thunderBufferCtxRef.current !== ctx) {
        if (!thunderBufferPromiseRef.current || thunderBufferCtxRef.current !== ctx) {
          thunderBufferPromiseRef.current = (async () => {
            if (!thunderDataRef.current) {
              const response = await fetch("/thunder.mp3");
              if (!response.ok) {
                throw new Error(`Failed to load thunder sound: ${response.status}`);
              }
              thunderDataRef.current = await response.arrayBuffer();
            }
            const decoded = await ctx.decodeAudioData(thunderDataRef.current.slice(0));
            thunderBufferCtxRef.current = ctx;
            thunderBufferRef.current = decoded;
            return decoded;
          })();
        }
        const buffer = await thunderBufferPromiseRef.current;
        thunderBufferPromiseRef.current = null;
        thunderBufferRef.current = buffer;
      }
    } catch (error) {
      console.error("Failed to load thunder sound", error);
      thunderBufferPromiseRef.current = null;
      return;
    }

    const buffer = thunderBufferRef.current;
    if (!buffer) return;

    if (!reverbBufferRef.current) {
      reverbBufferRef.current = createReverbImpulse(ctx);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const convolver = ctx.createConvolver();
    convolver.buffer = reverbBufferRef.current;
    convolver.normalize = true;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 20;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;

    const gain = ctx.createGain();
    gain.gain.value = 0.42;

    source.connect(convolver);
    source.connect(compressor);
    convolver.connect(gain);
    compressor.connect(gain);
    gain.connect(ctx.destination);

    const startTime = ctx.currentTime + 0.02;
    source.start(startTime);
    source.stop(startTime + buffer.duration + 0.1);
    source.onended = () => {
      source.disconnect();
      convolver.disconnect();
      compressor.disconnect();
      gain.disconnect();
    };
  }, []);

  const { thunderSoundEnabled } = usePreferences();

  useEffect(() => {
    if (!animateStrike || !thunderSoundEnabled) return;
    void playThunderSound();
  }, [animateStrike, playThunderSound, thunderSoundEnabled]);

  const formattedPoints = useMemo(() => points.toLocaleString(), [points]);
  const normalizedStreak = Math.max(0, Math.floor(studyStreak));
  const streakLabel = normalizedStreak === 1 ? "day" : "days";

  return (
    <>
      <div className="hidden lg:flex fixed bottom-6 right-6 z-40 flex-col gap-4 text-neutral-900 dark:text-white">
        <div className={`points-hud ${animateStrike ? "points-hud--lightning" : ""}`}>
          <div className="points-hud__glow" aria-hidden />
          <div className="points-hud__noise" aria-hidden />
          <div className="points-hud__surface relative z-10 flex flex-col gap-6 px-6 py-6">
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
            <div className="flex justify-end">
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
      </div>
      {!isLoggedIn && showLoginPrompt && (
        <div className="hidden lg:block points-hud__prompt">
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
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-5 pt-2 pointer-events-none">
        <nav
          className="points-hud-panel pointer-events-auto relative mx-auto w-full max-w-xl rounded-3xl overflow-hidden p-3 transition"
          aria-label="Lesson heads-up display"
        >
          <div className="grid grid-cols-4 gap-2">
            <div className="flex items-center justify-center">
              {isLoggedIn ? (
                <Link
                  to="/dashboard"
                  className="flex h-14 w-full items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-sm transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  aria-label="Account"
                >
                  <UserRound className="h-5 w-5" aria-hidden="true" />
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="flex h-14 w-full items-center justify-center gap-1.5 rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-sm transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                >
                  <LogIn className="h-5 w-5" aria-hidden="true" />
                  <span className="text-sm font-semibold">Log in</span>
                </Link>
              )}
            </div>
            <div
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-neutral-100/80 text-neutral-600 dark:bg-neutral-800/70 dark:text-neutral-300"
              aria-label={`You have ${formattedPoints} points`}
            >
              <Zap className="h-4 w-4 text-brand" aria-hidden="true" />
              <span className="text-[10px] uppercase tracking-wide" aria-hidden>
                Points
              </span>
              <span className={`text-sm font-semibold text-neutral-900 dark:text-neutral-100 ${
                animateStrike ? "points-hud__value--lightning" : ""
              }`}
                aria-live="polite"
              >
                {formattedPoints}
              </span>
            </div>
            <div
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-neutral-100/80 text-neutral-600 dark:bg-neutral-800/70 dark:text-neutral-300"
              aria-label={`Study streak ${normalizedStreak} ${streakLabel}`}
            >
              <Flame className="h-4 w-4 text-brand" aria-hidden="true" />
              <span className="text-[10px] uppercase tracking-wide" aria-hidden>
                Streak
              </span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {normalizedStreak}
              </span>
            </div>
            <div className="flex items-center justify-center">
              <button
                ref={courseContentButtonRef || undefined}
                type="button"
                onClick={onToggleCourseContent}
                aria-pressed={courseContentOpen ?? false}
                aria-expanded={courseContentOpen ?? false}
                aria-controls="toc-drawer"
                className="flex h-14 w-full items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-sm transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                <BookOpen className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Course content</span>
              </button>
            </div>
          </div>
        </nav>
      </div>
    </>
  );
}

