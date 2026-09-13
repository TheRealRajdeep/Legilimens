"use client";

import { useEffect, useState } from "react";

export type SeerMood = "idle" | "thinking" | "confident" | "stumped" | "triumphant";

// Probed once per mood per page load, shared across every Seer instance.
const artAvailable = new Map<SeerMood, Promise<boolean>>();
function probeArt(mood: SeerMood): Promise<boolean> {
  if (!artAvailable.has(mood)) {
    artAvailable.set(
      mood,
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = `/mascot/${mood}.png`;
      }),
    );
  }
  return artAvailable.get(mood)!;
}

/**
 * The mascot. Real art drops into /public/mascot/<mood>.png. Until a file exists the placeholder
 * silhouette renders at the same aspect ratio, so layouts and motion don't shift when art arrives.
 */
export function Seer({ mood, size = 220, className = "" }: { mood: SeerMood; size?: number; className?: string }) {
  const [hasArt, setHasArt] = useState<Partial<Record<SeerMood, boolean>>>({});
  useEffect(() => {
    let live = true;
    probeArt(mood).then((ok) => live && setHasArt((m) => ({ ...m, [mood]: ok })));
    return () => {
      live = false;
    };
  }, [mood]);
  const src = `/mascot/${mood}.png`;
  const mulling = mood === "thinking";

  return (
    <div
      className={`relative select-none ${mulling ? "mulling" : ""} ${className}`}
      style={{ width: size, height: size * 1.15 }}
      role="img"
      aria-label={`The Seer looks ${mood}`}
    >
      {hasArt[mood] ? (
        // eslint-disable-next-line @next/next/no-img-element -- art is optional and user-supplied; skip next/image sizing
        <img src={src} alt="" draggable={false} className="h-full w-full object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,0.55)]" />
      ) : (
        <SeerPlaceholder mood={mood} />
      )}
    </div>
  );
}

function SeerPlaceholder({ mood }: { mood: SeerMood }) {
  const eye =
    mood === "stumped" ? "M-9 0h18" : mood === "triumphant" || mood === "confident" ? "M-9 2q9-8 18 0" : "M-7 0a7 5 0 1 0 14 0a7 5 0 1 0-14 0";
  return (
    <svg viewBox="0 0 200 230" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="seer-hood" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#3a2d52" />
          <stop offset="100%" stopColor="#1b1526" />
        </radialGradient>
      </defs>
      {/* robe */}
      <path d="M100 58c-44 0-70 70-78 160h156c-8-90-34-160-78-160z" fill="url(#seer-hood)" stroke="#e2a83b" strokeOpacity=".35" />
      {/* hood */}
      <path d="M100 18c-30 0-52 30-52 64 0 18 10 30 22 36h60c12-6 22-18 22-36 0-34-22-64-52-64z" fill="#231c31" stroke="#e2a83b" strokeOpacity=".5" />
      {/* face shadow */}
      <ellipse cx="100" cy="86" rx="30" ry="26" fill="#0e0b15" />
      <g stroke="#e2a83b" strokeWidth="3" strokeLinecap="round" fill={mood === "idle" || mood === "thinking" ? "#e2a83b" : "none"}>
        <path d={eye} transform="translate(88 84)" />
        <path d={eye} transform="translate(112 84)" />
      </g>
      {/* star on hood */}
      <path d="M100 30l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#e2a83b" />
      <text x="100" y="206" textAnchor="middle" fontSize="11" fill="#b9ad93" fontFamily="Georgia, serif">
        mascot: {mood}
      </text>
    </svg>
  );
}
