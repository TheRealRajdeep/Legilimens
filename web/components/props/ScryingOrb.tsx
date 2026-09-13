"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * The guess appears inside the orb: mist swirls while the Seer's transaction confirms, then clears
 * to show the named trade. Rare event, and it's the climax of the game, so it gets the longest reveal.
 */
export function ScryingOrb({ vision }: { vision?: string }) {
  const reduce = useReducedMotion();
  const clouded = !vision;

  return (
    <div className="relative mx-auto aspect-square w-[min(78vw,340px)]">
      <div
        aria-hidden
        className="absolute inset-[-12%] rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(63,182,168,.35), transparent)" }}
      />
      <div
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: "radial-gradient(circle at 35% 30%, rgba(237,227,204,.28), transparent 38%), radial-gradient(circle at 50% 60%, #1f3b44, #15111f 75%)",
          boxShadow: "inset 0 -20px 60px rgba(0,0,0,.6), inset 0 10px 30px rgba(63,182,168,.25), 0 0 0 1px rgba(226,168,59,.35)",
        }}
      >
        {/* mist */}
        <motion.div
          aria-hidden
          className="absolute inset-[-30%]"
          style={{
            background:
              "radial-gradient(circle at 30% 40%, rgba(237,227,204,.55), transparent 35%), radial-gradient(circle at 70% 60%, rgba(63,182,168,.5), transparent 40%), radial-gradient(circle at 50% 50%, rgba(185,173,147,.4), transparent 50%)",
            filter: "blur(18px)",
          }}
          animate={
            clouded
              ? reduce
                ? { opacity: 0.9 }
                : { opacity: 0.95, transform: ["rotate(0deg) scale(1)", "rotate(360deg) scale(1.08)"] }
              : { opacity: 0, transform: "rotate(420deg) scale(1.5)" }
          }
          transition={
            clouded
              ? { duration: reduce ? 0.3 : 9, ease: "linear", repeat: reduce ? 0 : Infinity }
              : { duration: reduce ? 0.3 : 1.4, ease: EASE_OUT }
          }
        />

        <div className="absolute inset-0 grid place-items-center px-8 text-center">
          <AnimatePresence>
            {vision ? (
              <motion.p
                key={vision}
                className="brand text-(length:--text-lead) leading-tight text-parchment [text-shadow:0_0_24px_rgba(63,182,168,.6)]"
                initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(10px)", transform: "scale(0.94)" }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)", transform: "scale(1)" }}
                transition={{ duration: reduce ? 0.25 : 1.1, delay: reduce ? 0 : 0.45, ease: EASE_OUT }}
              >
                {vision}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <svg viewBox="0 0 200 40" className="absolute -bottom-6 left-1/2 w-2/3 -translate-x-1/2" aria-hidden>
        <path d="M20 8h160l-20 26H40z" fill="#231c31" stroke="#e2a83b" strokeOpacity=".5" />
        <path d="M60 18h80" stroke="#e2a83b" strokeOpacity=".35" />
      </svg>
    </div>
  );
}
