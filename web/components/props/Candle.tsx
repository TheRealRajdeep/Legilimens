"use client";

import { usdc } from "@/lib/format";

/**
 * The Seer's runway, as a candle. Wax height = how many more games the agent's own wallet can pay for.
 * State indication, rarely changes: a single transform transition, no ambient flicker.
 */
export function Candle({ runwayGames, balance }: { runwayGames?: number; balance?: bigint }) {
  const FULL_AT = 200; // games of runway that count as a full candle
  const fill = runwayGames === undefined ? 1 : Math.max(0.06, Math.min(1, runwayGames / FULL_AT));

  return (
    <figure className="flex items-end gap-4">
      <svg viewBox="0 0 40 120" className="h-28 w-10 shrink-0 overflow-visible" aria-hidden>
        <defs>
          <radialGradient id="flame" cx="50%" cy="70%" r="60%">
            <stop offset="0%" stopColor="#fff4d6" />
            <stop offset="45%" stopColor="#e2a83b" />
            <stop offset="100%" stopColor="#c4472d" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g
          style={{
            transform: `translateY(${(1 - fill) * 96}px)`,
            transition: "transform 900ms var(--ease-out)",
          }}
        >
          <ellipse cx="20" cy="6" rx="16" ry="14" fill="#e2a83b" opacity=".18" />
          <path d="M20 -6c5 7 7 11 7 15a7 7 0 0 1-14 0c0-4 2-8 7-15z" fill="url(#flame)" />
          <line x1="20" y1="10" x2="20" y2="16" stroke="#15111f" strokeWidth="1.5" />
        </g>
        <rect
          x="9"
          y="16"
          width="22"
          height="96"
          rx="2"
          fill="#ede3cc"
          style={{
            transformOrigin: "20px 112px",
            transform: `scaleY(${fill})`,
            transition: "transform 900ms var(--ease-out)",
          }}
        />
        <rect x="4" y="110" width="32" height="6" rx="1" fill="#8a6a3a" />
      </svg>
      <figcaption className="text-(length:--text-whisper) leading-snug text-faded">
        <span className="block text-parchment">The Seer&rsquo;s candle</span>
        {runwayGames === undefined ? (
          <>It pays for its own thinking from its winnings.</>
        ) : (
          <>
            {usdc(balance)} USDC in its purse, enough for about <span className="text-ember">{runwayGames}</span> more games.
          </>
        )}
      </figcaption>
    </figure>
  );
}
