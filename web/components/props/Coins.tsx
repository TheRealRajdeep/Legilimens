"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

/**
 * Coins pour when the player wins. Celebration tier: happens rarely and only on a win.
 * Under reduced motion nothing moves; the payout line carries the news.
 */
export function Coins({ count = 18 }: { count?: number }) {
  const reduce = useReducedMotion();
  const coins = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: (i / count - 0.5) * 260 + ((i * 37) % 23) - 11,
        delay: (i % 6) * 0.07 + i * 0.02,
        spin: (i % 2 ? 1 : -1) * (180 + ((i * 53) % 180)),
        fall: 200 + ((i * 29) % 90),
      })),
    [count],
  );

  if (reduce) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0 overflow-visible">
      {coins.map((c) => (
        <motion.span
          key={c.id}
          className="absolute left-1/2 top-0 block h-5 w-5 rounded-full"
          style={{
            background: "radial-gradient(circle at 35% 30%, #fff1c9, #e2a83b 55%, #8a6a3a)",
            boxShadow: "0 0 0 1px rgba(21,17,31,.35)",
          }}
          initial={{ opacity: 0, transform: `translate(${c.x * 0.2}px, -20px) rotate(0deg) scale(0.9)` }}
          animate={{
            opacity: [0, 1, 1, 0],
            transform: `translate(${c.x}px, ${c.fall}px) rotate(${c.spin}deg) scale(1)`,
          }}
          transition={{ duration: 1.3, delay: c.delay, ease: [0.23, 1, 0.32, 1], opacity: { times: [0, 0.1, 0.75, 1], duration: 1.3, delay: c.delay } }}
        />
      ))}
    </div>
  );
}
