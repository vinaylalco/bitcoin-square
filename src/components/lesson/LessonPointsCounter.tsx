import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flame, LogIn, UserRound, Zap } from "lucide-react";
import { Link } from "react-router-dom";

function createThunderBuffer(ctx: BaseAudioContext): AudioBuffer {
  const duration = 1.1;
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  let low = 0;
  let mid = 0;
  const rumblePhaseA = Math.random() * Math.PI * 2;
  const rumblePhaseB = Math.random() * Math.PI * 2;

  for (let i = 0; i < length; i += 1) {
    const t = i / ctx.sampleRate;
    const norm = t / duration;

    const white = Math.random() * 2 - 1;
    low += 0.03 * (white - low);
    mid += 0.18 * (white - mid);
    const high = white - mid;

    const boltEnvelope = norm < 0.18 ? Math.exp(-norm * 42) : 0;
    const secondaryEnvelope = norm > 0.22 ? Math.exp(-(norm - 0.22) * 18) * 0.6 : 0;
    const bolt = (high * 0.7 + mid * 0.3) * boltEnvelope;
    const secondaryBolt = (high * 0.45 + mid * 0.55) * secondaryEnvelope;

    const rumbleEnvelope = Math.pow(Math.max(0, 1 - norm), 1.15);
    const rumbleNoise = low * 0.55 * rumbleEnvelope;
    const rumbleSine =
      Math.sin(2 * Math.PI * 48 * t + rumblePhaseA) * 0.26 * rumbleEnvelope +
      Math.sin(2 * Math.PI * 32 * t + rumblePhaseB) * 0.18 * rumbleEnvelope;

    const flutter = Math.sin(2 * Math.PI * 8 * t) * 0.08 * rumbleEnvelope;

    const aftershockEnvelope = norm > 0.34 ? Math.pow(1 - Math.min(1, (norm - 0.34) / 0.7), 2.4) : 0;
    const aftershockNoise = (mid * 0.22 + low * 0.18) * aftershockEnvelope;
    const aftershockTone =
      norm > 0.34 ? Math.sin(2 * Math.PI * 96 * (t - 0.34)) * 0.12 * aftershockEnvelope : 0;

    const combined =
      bolt + secondaryBolt + rumbleNoise + rumbleSine + flutter + aftershockNoise + aftershockTone;
    data[i] = Math.max(-1, Math.min(1, combined * 0.82));
  }

  return buffer;
}

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
  const audioContextRef = useRef<AudioContext | null>(null);
  const thunderBufferRef = useRef<AudioBuffer | null>(null);
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
      reverbBufferRef.current = null;
    }
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // Ignore resume failures and attempt playback regardless
      }
    }

    if (!thunderBufferRef.current) {
      thunderBufferRef.current = createThunderBuffer(ctx);
    }
    if (!reverbBufferRef.current) {
      reverbBufferRef.current = createReverbImpulse(ctx);
    }

    const source = ctx.createBufferSource();
    source.buffer = thunderBufferRef.current;

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
    source.stop(startTime + (thunderBufferRef.current?.duration ?? 1.1) + 0.1);
    source.onended = () => {
      source.disconnect();
      convolver.disconnect();
      compressor.disconnect();
      gain.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!animateStrike) return;
    void playThunderSound();
  }, [animateStrike, playThunderSound]);

  const formattedPoints = useMemo(() => points.toLocaleString(), [points]);
  const normalizedStreak = Math.max(0, Math.floor(studyStreak));
  const streakLabel = normalizedStreak === 1 ? "day" : "days";

  return (
    <div className="hidden md:flex fixed bottom-6 right-6 z-30 flex-col gap-4 text-white">
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

