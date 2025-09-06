import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Card as CardType } from "../../types/lesson-plan";
import Card from "./Card";

interface SliderCard extends CardType {
  topicName: string;
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

export default function Slider({ cards }: { cards: SliderCard[] }) {
  const [index, setIndex] = useState(0);
  const total = cards.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [chrome, setChrome] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

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
  const percent = total > 0 ? Math.round(((index + 1) / total) * 100) : 0;

  return (
    <div style={{ "--chrome": `${chrome}px` } as React.CSSProperties}>
      <div className="flex items-center mb-4">
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
      <div className="relative">
        <div
          ref={containerRef}
          className="flex overflow-x-auto snap-x snap-mandatory"
        >
          {cards.map((c) => (
            <div
              key={c.id}
              className="w-full flex-shrink-0 snap-start"
            >
              <div className="overflow-y-auto">
                <Card card={c} topicName={c.topicName} />
              </div>
            </div>
          ))}
        </div>
        {index > 0 && (
          <button
            onClick={prev}
            aria-label="Previous"
            className="hidden lg:flex items-center justify-center absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full w-10 h-10 bg-white border rounded-full shadow"
          >
            <ChevronLeft />
          </button>
        )}
        {index < total - 1 && (
          <button
            onClick={next}
            aria-label="Next"
            className="hidden lg:flex items-center justify-center absolute right-0 top-1/2 -translate-y-1/2 translate-x-full w-10 h-10 bg-white border rounded-full shadow"
          >
            <ChevronRight />
          </button>
        )}
      </div>
    </div>
  );
}
