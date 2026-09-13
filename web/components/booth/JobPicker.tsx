"use client";

import { useMemo, useState } from "react";
import { JOBS, type Job } from "@/lib/solver";

/** Searchable ledger of trades. The chosen trade is only ever shown locally; the chain sees a hash. */
export function JobPicker({ selected, onSelect }: { selected?: Job; onSelect: (job: Job) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...JOBS].sort((a, b) => a.title.localeCompare(b.title));
    return q ? sorted.filter((j) => j.title.toLowerCase().includes(q)) : sorted;
  }, [query]);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-(length:--text-whisper) text-quill/70">Search the ledger of trades</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nurse, pilot, carpenter…"
          className="w-full border-b-2 border-quill/30 bg-transparent px-1 py-2 text-(length:--text-lead) text-quill placeholder:text-quill/40 focus:border-hex focus:outline-none"
          autoFocus
        />
      </label>
      <ul role="listbox" aria-label="Trades" className="grid max-h-[40vh] grid-cols-1 gap-x-6 overflow-y-auto pr-2 sm:grid-cols-2">
        {results.map((job) => {
          const active = selected?.code === job.code;
          return (
            <li key={job.code} role="option" aria-selected={active}>
              <button
                onClick={() => onSelect(job)}
                className={`flex w-full items-baseline justify-between gap-3 border-b border-dotted border-quill/20 px-1 py-2 text-left transition-colors duration-150 ${
                  active ? "text-hex" : "text-quill hover:text-hex"
                }`}
              >
                <span>{job.title}</span>
                {active ? <span aria-hidden>✦</span> : null}
              </button>
            </li>
          );
        })}
        {results.length === 0 ? (
          <li className="col-span-full py-4 text-quill/70">
            That trade isn&rsquo;t in the Seer&rsquo;s ledger. Pick the nearest one you would honestly answer as.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
