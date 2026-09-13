"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";

/**
 * The pot. When its value changes the figure counts to the new amount and the cauldron's glow surges
 * (grew) or gutters (paid out). State indication on a rare event, so it may take its time.
 */
export function Cauldron({ pot, size = "lg" }: { pot?: bigint; size?: "lg" | "sm" }) {
  const reduce = useReducedMotion();
  const target = pot === undefined ? undefined : Number(formatUnits(pot, 18));
  const [shown, setShown] = useState(target ?? 0);
  const [pulse, setPulse] = useState<"surge" | "drain" | null>(null);
  const previous = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (target === undefined) return;
    const from = previous.current;
    previous.current = target;
    if (from === undefined || reduce) {
      setShown(target);
      return;
    }
    if (from === target) return;
    setPulse(target > from ? "surge" : "drain");
    const controls = animate(from, target, {
      duration: 1.1,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: setShown,
      onComplete: () => setPulse(null),
    });
    return () => controls.stop();
  }, [target, reduce]);

  const glow = pulse === "surge" ? 0.75 : pulse === "drain" ? 0.12 : 0.4;
  const big = size === "lg";

  return (
    <figure className={`relative flex flex-col items-center ${big ? "gap-2" : "gap-1"}`}>
      <div className="relative" style={{ width: big ? 260 : 120, height: big ? 190 : 88 }}>
        <div
          aria-hidden
          className="absolute inset-x-[8%] top-[4%] h-[70%] rounded-full blur-2xl"
          style={{
            background: "radial-gradient(closest-side, #e2a83b, transparent)",
            opacity: glow,
            transform: `scale(${pulse === "surge" ? 1.12 : 1})`,
            transition: "opacity 600ms var(--ease-out), transform 600ms var(--ease-out)",
          }}
        />
        <svg viewBox="0 0 260 190" className="relative h-full w-full" aria-hidden>
          <ellipse cx="130" cy="62" rx="104" ry="20" fill="#e2a83b" opacity=".85" />
          <ellipse cx="130" cy="62" rx="104" ry="20" fill="none" stroke="#fff1c9" strokeOpacity=".5" />
          <path d="M26 62c0 70 40 110 104 110s104-40 104-110c-20 14-60 20-104 20S46 76 26 62z" fill="#231c31" stroke="#e2a83b" strokeOpacity=".55" />
          <path d="M60 170l-14 16M200 170l14 16" stroke="#8a6a3a" strokeWidth="6" strokeLinecap="round" />
          <path d="M18 58h224" stroke="#8a6a3a" strokeWidth="8" strokeLinecap="round" />
          <text x="130" y="128" textAnchor="middle" fill="#e2a83b" opacity=".35" fontSize="28">
            ✦
          </text>
        </svg>
      </div>
      <figcaption className="text-center">
        <span
          className={`brand block tabular-nums text-ember ${big ? "text-(length:--text-title)" : "text-(length:--text-lead)"}`}
          aria-live="polite"
        >
          {target === undefined ? "—" : shown.toFixed(2)}
        </span>
        <span className="block text-(length:--text-whisper) text-faded">USDC in the pot · winners take half</span>
      </figcaption>
    </figure>
  );
}
