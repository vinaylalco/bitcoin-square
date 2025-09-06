import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Card as CardType, Topic } from "../../types/lesson-plan";
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

export default function Slider({
  cards,
  topics,
}: {
  cards: SliderCard[];
  topics: Topic[];
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

  const idToIndex = useMemo(() => {
    const map = new Map<string, number>();
    cards.forEach((c, i) => map.set(c.id, i));
    return map;
  }, [cards]);

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
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setTocOpen((o) => !o)}
        className="mb-4 block w-full text-lg font-large border-2 border-brand bg-white text-neutral-900 py-2 rounded focus:outline-none focus-visible:ring-2 ring-brand"
        aria-controls="toc-drawer"
        aria-expanded={tocOpen}
      >
        Course Structure
      </button>
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
          aria-labelledby="toc-title"
          className={`absolute inset-0 z-10 bg-white overflow-y-auto p-4 ${
            reduceMotion ? "" : "transition duration-200 ease-out transform"
          } ${
            tocOpen
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-2 pointer-events-none"
          }`}
        >
          <h2
            id="toc-title"
            className="font-semibold mb-2 sticky top-0 bg-white"
          >
            Course sections
          </h2>
          <ul className="space-y-2">
            {topics.map((t) => (
              <li key={t.name}>
                <p className="font-medium">{t.name}</p>
                <ul className="ml-4 space-y-1">
                  {t.cards.map((c) => (
                    <li key={c.id}>
                      <button
                        className="text-left w-full px-2 py-1 rounded focus:outline-none focus-visible:ring-2 ring-brand"
                        onClick={() => handleSelect(c.id)}
                      >
                        {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
