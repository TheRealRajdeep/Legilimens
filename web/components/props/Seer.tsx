"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";

export type SeerMood = "idle" | "thinking" | "confident" | "stumped" | "triumphant";

const MOODS: SeerMood[] = ["idle", "thinking", "confident", "stumped", "triumphant"];
const src = (mood: SeerMood) => `/mascot/${mood}.webp`;

let preloaded = false;
function preloadMoods() {
  if (preloaded || typeof window === "undefined") return;
  preloaded = true;
  for (const mood of MOODS) new Image().src = src(mood);
}

/**
 * The Seer, shown as a tarot card. Art is 4:5 (see art/process_art.py). Mood changes crossfade so a
 * switch from "thinking" to "confident" mid-question reads as a change of expression, not a page jump.
 */
export function Seer({ mood, size = 220, className = "" }: { mood: SeerMood; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  useEffect(preloadMoods, []);

  return (
    <div
      className={`tarot-frame relative select-none overflow-visible rounded-[3px] bg-ink shadow-[0_24px_50px_-12px_rgba(0,0,0,0.75)] ${
        mood === "thinking" ? "mulling" : ""
      } ${className}`}
      style={{ width: size, height: size * 1.25 }}
      role="img"
      aria-label={`The Seer looks ${mood}`}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[3px]">
        <AnimatePresence initial={false}>
          <motion.img
            key={mood}
            src={src(mood)}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.15 : 0.28, ease: [0.23, 1, 0.32, 1] }}
          />
        </AnimatePresence>
        {/* candle vignette so the card sits in the booth's light rather than on top of it */}
        <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_40px_rgba(21,17,31,0.55)]" />
      </div>
    </div>
  );
}
