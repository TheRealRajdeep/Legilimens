"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type SealState = "unsealed" | "stamping" | "sealed" | "cracked";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * The commitment, made physical. Stamping and cracking each happen once per game: that is the delight
 * budget, so these are allowed to be slower and more theatrical than UI transitions.
 */
export function WaxSeal({ state, label }: { state: SealState; label?: string }) {
  const reduce = useReducedMotion();

  return (
    <div className="relative grid h-36 w-36 place-items-center" aria-live="polite">
      <span className="sr-only">
        {state === "sealed" ? "Your job is sealed." : state === "cracked" ? "The seal is broken." : ""}
      </span>
      <AnimatePresence>
        {state === "stamping" || state === "sealed" ? (
          <motion.div
            key="whole"
            className="absolute inset-0"
            initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(-46px) scale(1.35) rotate(-14deg)" }}
            animate={
              reduce
                ? { opacity: 1 }
                : {
                    opacity: 1,
                    transform: ["translateY(-46px) scale(1.35) rotate(-14deg)", "translateY(0px) scale(0.94) rotate(-4deg)", "translateY(0px) scale(1) rotate(-6deg)"],
                  }
            }
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: reduce ? 0.2 : 0.62, times: [0, 0.62, 1], ease: EASE_OUT }}
          >
            <SealDisc label={label} />
          </motion.div>
        ) : null}

        {state === "cracked" ? (
          <motion.div key="cracked" className="absolute inset-0" initial={{ opacity: 1 }} animate={{ opacity: 1 }}>
            {(["left", "right"] as const).map((half) => (
              <motion.div
                key={half}
                className="absolute inset-0"
                style={{ clipPath: half === "left" ? "polygon(0 0, 54% 0, 44% 38%, 56% 60%, 46% 100%, 0 100%)" : "polygon(54% 0, 100% 0, 100% 100%, 46% 100%, 56% 60%, 44% 38%)" }}
                initial={{ transform: "translateX(0px) rotate(-6deg)", opacity: 1 }}
                animate={
                  reduce
                    ? { opacity: 0.35 }
                    : {
                        transform: half === "left" ? "translateX(-22px) translateY(8px) rotate(-22deg)" : "translateX(22px) translateY(10px) rotate(12deg)",
                        opacity: 0.55,
                      }
                }
                transition={{ duration: reduce ? 0.2 : 0.7, ease: EASE_OUT, delay: reduce ? 0 : 0.08 }}
              >
                <SealDisc label={label} />
              </motion.div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {state === "unsealed" ? (
        <div className="grid h-full w-full place-items-center rounded-full border border-dashed border-faded/40 text-center text-(length:--text-whisper) text-faded">
          unsealed
        </div>
      ) : null}
    </div>
  );
}

function SealDisc({ label }: { label?: string }) {
  return (
    <svg viewBox="0 0 140 140" className="h-full w-full drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)]" aria-hidden>
      <path
        d="M70 6c9 0 12 6 20 8s15-2 21 4 2 13 5 20 10 11 10 20-7 12-9 20 3 15-3 21-13 2-20 5-11 10-20 10-12-7-20-9-15 3-21-3-2-13-5-20S6 79 6 70s7-12 9-20-3-15 3-21 13-2 20-5S61 6 70 6z"
        fill="#c4472d"
      />
      <circle cx="70" cy="70" r="44" fill="none" stroke="#7c2616" strokeWidth="3" />
      <circle cx="70" cy="70" r="36" fill="#b33e26" />
      <path d="M70 44l6 16 17 1-13 11 5 17-15-10-15 10 5-17-13-11 17-1z" fill="#7c2616" />
      {label ? (
        <text x="70" y="124" textAnchor="middle" fontSize="9" fill="#ede3cc" opacity=".8" fontFamily="Georgia, serif">
          {label}
        </text>
      ) : null}
    </svg>
  );
}
