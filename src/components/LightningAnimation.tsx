import React, { useEffect } from "react";

type Props = {
  active: boolean;
  duration?: number;
  onComplete?: () => void;
};

const DEFAULT_DURATION = 900;

const STYLE_ID = "lightning-animation-styles";

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes lightning-bolt-entry {
      0% { opacity: 0; transform: scale(0.4) translateY(-30%); }
      20% { opacity: 1; transform: scale(1.05) translateY(0); }
      60% { opacity: 1; transform: scale(1) translateY(0); }
      100% { opacity: 0; transform: scale(0.9) translateY(8%); }
    }
    @keyframes lightning-screen-flash {
      0% { opacity: 0; }
      20% { opacity: 0.9; }
      100% { opacity: 0; }
    }
    .lightning-bolt-animation svg {
      animation: lightning-bolt-entry var(--lightning-duration, ${DEFAULT_DURATION}ms) ease-out forwards;
      filter: drop-shadow(0 0 25px rgba(250, 204, 21, 0.6));
    }
    .lightning-flash-overlay {
      animation: lightning-screen-flash var(--lightning-duration, ${DEFAULT_DURATION}ms) ease-out forwards;
    }
  `;
  document.head.appendChild(style);
}

export default function LightningAnimation({ active, duration = DEFAULT_DURATION, onComplete }: Props) {
  useEffect(() => {
    ensureStyles();
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => onComplete?.(), duration);
    return () => window.clearTimeout(timer);
  }, [active, duration, onComplete]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center"
      style={{ "--lightning-duration": `${duration}ms` } as React.CSSProperties}
      aria-hidden
    >
      <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] lightning-flash-overlay" />
      <div className="lightning-bolt-animation relative h-48 w-24">
        <svg viewBox="0 0 120 240" className="h-full w-full" role="presentation">
          <defs>
            <linearGradient id="lightning-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="50%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
          <path
            d="M68 0L24 112h36L36 240l72-140h-40L100 0H68z"
            fill="url(#lightning-gradient)"
            stroke="#fcd34d"
            strokeWidth="4"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
