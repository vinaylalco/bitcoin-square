import React, { useEffect, useState } from "react";

/** Tiny CSS confetti burst. Disappears automatically. */
export default function PartyPopper({ fire }: { fire: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (fire) {
      setShow(true);
      const t = setTimeout(() => setShow(false), 900);
      return () => clearTimeout(t);
    }
  }, [fire]);

  if (!show) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 grid place-items-center"
    >
      <div className="relative h-10 w-10">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={
              {
                "--i": i,
                "--h": `${(i * 36) % 360}`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
