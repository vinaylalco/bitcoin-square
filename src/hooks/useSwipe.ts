import { useEffect } from "react";

type Opts = {
  enabled?: boolean;
  axis?: "x" | "y";
  onMove?: (delta: number) => void;
  onEnd?: (delta: number) => void;
};

export function useSwipe(
  ref: React.RefObject<HTMLElement | null>,
  { enabled = true, axis = "x", onMove, onEnd }: Opts
) {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    let startX = 0;
    let startY = 0;
    let active = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      active = true;
    };
    const onMoveInternal = (e: TouchEvent) => {
      if (!active) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const d = axis === "x" ? dx : dy;
      onMove?.(d);
    };
    const onEndInternal = (e: TouchEvent) => {
      if (!active) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const d = axis === "x" ? dx : dy;
      active = false;
      onEnd?.(d);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMoveInternal, { passive: true });
    el.addEventListener("touchend", onEndInternal);
    el.addEventListener("touchcancel", onEndInternal);

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMoveInternal);
      el.removeEventListener("touchend", onEndInternal);
      el.removeEventListener("touchcancel", onEndInternal);
    };
  }, [ref, enabled, axis, onMove, onEnd]);
}
