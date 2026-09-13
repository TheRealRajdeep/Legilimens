"use client";

import { useEffect } from "react";
import { Seer } from "../props/Seer";
import type { Question } from "./api";

// Display order and hotkeys. Values are the on-chain answer codes (3 = Yes … 0 = No).
const SIGILS = [
  { value: 3, label: "Yes", glyph: "☉", key: "1" },
  { value: 2, label: "Probably", glyph: "☽", key: "2" },
  { value: 1, label: "Probably not", glyph: "☾", key: "3" },
  { value: 0, label: "No", glyph: "✕", key: "4" },
] as const;

export function QuestionCard({
  question,
  loading,
  onAnswer,
}: {
  question?: Question;
  loading: boolean;
  onAnswer: (value: number) => void;
}) {
  useEffect(() => {
    if (!question || loading) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const sigil = SIGILS.find((s) => s.key === e.key);
      if (sigil) {
        e.preventDefault();
        onAnswer(sigil.value);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [question, loading, onAnswer]);

  const mood = loading ? "thinking" : question && question.confidence > 0.45 ? "confident" : "idle";

  return (
    <section className="mx-auto grid max-w-5xl items-center gap-8 px-6 py-10 md:grid-cols-[minmax(0,240px)_1fr] md:gap-14">
      <div className="flex flex-col items-center gap-3">
        <Seer mood={mood} size={220} />
        {question ? (
          <p className="brand text-(length:--text-lead) text-ember" aria-label={`Question ${question.step + 1} of ${question.total}`}>
            {question.step + 1}
            <span className="text-faded"> / {question.total}</span>
          </p>
        ) : null}
      </div>

      <div className="space-y-8">
        <div className="min-h-[7.5rem]" aria-live="polite" aria-atomic>
          {question && !loading ? (
            <h2 key={question.step} className="ink-in brand text-(length:--text-title) leading-[1.1] text-parchment">
              {question.text}
            </h2>
          ) : (
            <p className="text-(length:--text-lead) italic text-faded">The Seer mutters over its cards…</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Your answer">
          {SIGILS.map((s) => (
            <button
              key={s.value}
              disabled={!question || loading}
              onClick={() => onAnswer(s.value)}
              className="press group relative flex flex-col items-center gap-1 rounded-[3px] border border-ember/40 bg-soot/70 px-3 py-4 text-parchment hover:border-ember hover:bg-soot disabled:cursor-wait disabled:opacity-40"
            >
              <span aria-hidden className="text-2xl text-ember">
                {s.glyph}
              </span>
              <span className="font-semibold">{s.label}</span>
              <kbd className="absolute right-2 top-1.5 text-xs text-faded/80">{s.key}</kbd>
            </button>
          ))}
        </div>
        <p className="text-(length:--text-whisper) text-faded">
          Answer as your sealed trade honestly would. Keys 1–4 work too.
        </p>
      </div>
    </section>
  );
}
