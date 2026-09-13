import type { PriorCounts } from "@/lib/solver";
import { getBooth } from "./booth";

// The Seer's prior over occupations is learned from past games indexed by The Graph.
// Only games settled strictly before this game's start block count, so a replay later
// reconstructs exactly the same prior no matter how much history has accumulated since.

const cache = new Map<string, PriorCounts>();

type SubgraphResponse = {
  data?: {
    _meta: { block: { number: number } };
    games: { jobCode: number }[];
  };
  errors?: { message: string }[];
};

export class SubgraphLaggingError extends Error {}

export async function priorCountsAt(startBlock: bigint): Promise<{ counts: PriorCounts; source: "subgraph" | "uniform" }> {
  const url = (await getBooth()).subgraph;
  if (!url) return { counts: {}, source: "uniform" };

  const key = startBlock.toString();
  const cached = cache.get(key);
  if (cached) return { counts: cached, source: "subgraph" };

  const query = `query Prior($before: BigInt!) {
    _meta { block { number } }
    games(first: 1000, where: { settledBlock_lt: $before, outcome_in: [AgentWin, Push, PlayerWin] }) { jobCode }
  }`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { before: key } }),
    cache: "no-store",
  });
  const json = (await res.json()) as SubgraphResponse;
  if (!res.ok || json.errors?.length || !json.data) {
    throw new Error(`subgraph query failed: ${json.errors?.[0]?.message ?? res.status}`);
  }
  // Until the indexer has passed startBlock, earlier settlements may still be missing. Refuse rather than guess.
  if (BigInt(json.data._meta.block.number) < startBlock) {
    throw new SubgraphLaggingError(`subgraph at block ${json.data._meta.block.number}, need ${startBlock}`);
  }

  const counts: PriorCounts = {};
  for (const g of json.data.games) counts[g.jobCode] = (counts[g.jobCode] ?? 0) + 1;
  cache.set(key, counts);
  return { counts, source: "subgraph" };
}
