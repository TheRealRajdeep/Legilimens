import { GameStatus } from "@/lib/config";
import { QUESTION_BUDGET, priorFrom, type Answer } from "@/lib/solver";
import { deriveSeed, readGame, type OnchainGame } from "./agent";
import { priorCountsAt, SubgraphLaggingError } from "./prior";

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function parseAnswers(raw: unknown, { complete }: { complete: boolean }): Answer[] {
  if (!Array.isArray(raw) || raw.some((a) => ![0, 1, 2, 3].includes(a))) {
    throw new RequestError("answers must be an array of 0..3", 400);
  }
  if (complete ? raw.length !== QUESTION_BUDGET : raw.length >= QUESTION_BUDGET) {
    throw new RequestError(complete ? `expected ${QUESTION_BUDGET} answers` : "all questions already answered", 400);
  }
  return raw as Answer[];
}

/** Loads everything the solver needs for a game: on-chain state, the re-derived seed and the as-of-start prior. */
export async function loadGame(gameIdRaw: unknown): Promise<{ gameId: bigint; game: OnchainGame; seed: `0x${string}`; prior: number[] }> {
  let gameId: bigint;
  try {
    gameId = BigInt(gameIdRaw as string);
  } catch {
    throw new RequestError("invalid gameId", 400);
  }
  const game = await readGame(gameId);
  if (game.status === GameStatus.None) throw new RequestError("game not found", 404);

  const seed = deriveSeed(game.jobCommit, game.playerKey);
  // The indexer usually trails the chain by a few blocks; wait it out here rather than bouncing every client.
  for (let attempt = 0; ; attempt++) {
    try {
      const { counts } = await priorCountsAt(game.startBlock);
      return { gameId, game, seed, prior: priorFrom(counts) };
    } catch (err) {
      if (!(err instanceof SubgraphLaggingError)) throw err;
      if (attempt >= 12) throw new RequestError("The Seer is still reading the archives, retry in a moment", 503);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

export function errorResponse(err: unknown) {
  if (err instanceof RequestError) return Response.json({ error: err.message }, { status: err.status });
  console.error(err);
  return Response.json({ error: err instanceof Error ? err.message : "unexpected error" }, { status: 500 });
}
