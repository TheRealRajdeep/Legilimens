"use client";

import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";

type Level = "empty" | "low" | "mid" | "full";

/** Pot art state, measured in stakes so it still reads right if the stake changes. */
function levelFor(potUsdc: number, stakeUsdc: number): Level {
  const stakes = potUsdc / Math.max(stakeUsdc, 1e-9);
  if (stakes <= 0.001) return "empty";
  if (stakes < 3) return "low";
  if (stakes < 8) return "mid";
  return "full";
}

/**
 * The vault. The pot fills (empty → low → mid → full and glowing) as the pot grows. When the value
 * changes the figure counts to it and the glow surges (grew) or gutters (paid out).
 * State indication on a rare event, so it may take its time.
 */
export function Cauldron({ pot, stake, size = "lg" }: { pot?: bigint; stake?: bigint; size?: "lg" | "sm" }) {
  const reduce = useReducedMotion();
  const target = pot === undefined ? undefined : Number(formatUnits(pot, 18));
  const stakeUsdc = stake === undefined ? 1 : Number(formatUnits(stake, 18));
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

  const level = levelFor(target ?? 0, stakeUsdc);
  const baseGlow = { empty: 0, low: 0.2, mid: 0.4, full: 0.65 }[level];
  const glow = pulse === "surge" ? Math.min(0.9, baseGlow + 0.35) : pulse === "drain" ? baseGlow * 0.3 : baseGlow;
  const big = size === "lg";

  return (
    <figure className={`relative flex ${big ? "flex-col items-center gap-1" : "items-center gap-2"}`}>
      <div className="relative" style={{ width: big ? 280 : 64, height: big ? 190 : 44 }}>
        <div
          aria-hidden
          className="absolute inset-x-[10%] top-[-6%] h-[70%] rounded-full blur-2xl"
          style={{
            background: "radial-gradient(closest-side, #e2a83b, transparent)",
            opacity: glow,
            transform: `scale(${pulse === "surge" ? 1.15 : 1})`,
            transition: "opacity 600ms var(--ease-out), transform 600ms var(--ease-out)",
          }}
        />
        <AnimatePresence initial={false}>
          <motion.img
            key={level}
            src={`/props/pot-${level}.webp`}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_14px_18px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.15 : 0.5, ease: [0.23, 1, 0.32, 1] }}
          />
        </AnimatePresence>
      </div>
      <figcaption className={big ? "text-center" : "text-left leading-tight"}>
        <span
          className={`brand block tabular-nums text-ember ${big ? "text-(length:--text-title)" : "text-(length:--text-lead)"}`}
          aria-live="polite"
        >
          {target === undefined ? "—" : shown.toFixed(2)}
        </span>
        <span className="block text-(length:--text-whisper) text-faded">
          {big ? "USDC in the pot · winners take half" : "USDC pot"}
        </span>
      </figcaption>
    </figure>
  );
}
