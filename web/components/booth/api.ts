"use client";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

export type StartAuth = { seedCommit: `0x${string}`; playerKey: `0x${string}`; expiry: string; sig: `0x${string}` };
export type Question = { step: number; traitIndex: number; traitId: string; text: string; confidence: number; total: number };
export type GuessResult = { guessCode: number; title: string; confidence?: number; txHash: `0x${string}` | null };

export type Reading = {
  name: string;
  url: string;
  exists: boolean;
  readings: number;
  named: number;
  close: number;
  baffled: number;
  caughtLying: number;
  lastReading: string;
  txs?: `0x${string}`[];
};

export const api = {
  recordReading: (gameId: string) =>
    call<Reading>("/api/reputation/record", { method: "POST", body: JSON.stringify({ gameId }) }),
  names: (players: string[]) => call<Record<string, Reading>>(`/api/reputation/names?players=${players.join(",")}`),
  start: (body: { player: string; jobCommit: string }) =>
    call<StartAuth>("/api/start", { method: "POST", body: JSON.stringify(body) }),
  question: (gameId: string, answers: number[]) =>
    call<Question>("/api/question", { method: "POST", body: JSON.stringify({ gameId, answers }) }),
  guess: (gameId: string, answers: number[]) =>
    call<GuessResult>("/api/guess", { method: "POST", body: JSON.stringify({ gameId, answers }) }),
};

/** Server returns 503 while the subgraph catches up to the game's start block; wait it out quietly. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const lagging = err instanceof Error && err.message.includes("archives");
      if (!lagging || i >= attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
