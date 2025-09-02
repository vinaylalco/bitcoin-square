import React, { useEffect, useRef } from "react";

function getFocusable(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"));
}

export default function FocusTrap({
  active,
  children,
  onDeactivate,
  returnFocusRef,
}: {
  active: boolean;
  children: React.ReactNode;
  onDeactivate?: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const prevFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    prevFocusedRef.current = document.activeElement as HTMLElement | null;
    const root = rootRef.current!;
    const items = getFocusable(root);
    (items[0] || root).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = getFocusable(root);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const onClickOutside = (e: MouseEvent) => {
      if (!root.contains(e.target as Node)) {
        onDeactivate?.();
      }
    };

    document.addEventListener("keydown", onKey);
    // (Click outside handled by overlay in App; this is just a safety)
    document.addEventListener("mousedown", onClickOutside);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
      // restore focus
      const back = returnFocusRef?.current || prevFocusedRef.current;
      back?.focus?.();
    };
  }, [active, onDeactivate, returnFocusRef]);

  return (
    <div ref={rootRef} tabIndex={-1}>
      {children}
    </div>
  );
}
