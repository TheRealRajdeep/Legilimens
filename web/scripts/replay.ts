// Replays a Legilimens game from public data only and checks the Seer played by its published algorithm.
//
//   node scripts/replay.ts <gameId>      replay one game
//   node scripts/replay.ts all           replay every game the Seer has guessed
//
// Needs no secrets and no access to the app server. Defaults point at the live Arc testnet deployment;
// override with RPC_URL, VAULT, DEPLOY_BLOCK and SUBGRAPH_URL.
//
// What it verifies, per game:
//   1. the matrix in this repo is the one committed on-chain (MATRIX_HASH)
//   2. the seed the Seer revealed matches the commitment it made before play
//   3. the prior, rebuilt from on-chain Settled events before the game's start block (and cross-checked
//      against The Graph when available)
//   4. re-running the solver with that seed, prior and the player's answers asks exactly the traits the
//      Seer published, and ends on exactly the guess it posted
//   5. the answer-fit verdict recorded at settlement matches both this repo's scorer and the contract's fit()
import { readFileSync } from "node:fs";
import { createPublicClient, defineChain, encodeAbiParameters, http, keccak256, toBytes, type Hex } from "viem";
import { vaultAbi } from "../lib/abi.ts";
import { JOBS, consistency, finalGuess, jobByCode, priorFrom, replay, unpackAnswers, type Answer, type PriorCounts } from "../lib/solver.ts";

const RPC_URL = process.env.RPC_URL ?? "https://rpc.testnet.arc.network";
const VAULT = (process.env.VAULT ?? "0x8286DE5954296D78ce2f276424F9dEe3a60bA9D8") as Hex;
const DEPLOY_BLOCK = BigInt(process.env.DEPLOY_BLOCK ?? "61886523");
const SUBGRAPH_URL = process.env.SUBGRAPH_URL ?? "https://api.studio.thegraph.com/query/1760267/guessworker/v0.0.2";
const LOG_CHUNK = 10_000n;

const OUTCOMES = ["None", "AgentWin", "Push", "PlayerWin", "Forfeit", "Refund", "Inconsistent"] as const;
const PRIOR_OUTCOMES = new Set([1, 2, 3]); // must match web/lib/server/prior.ts

const chain = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});
const client = createPublicClient({ chain, transport: http() });

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const ok = (s: string) => console.log(`  ${paint(32, "✓")} ${s}`);
const bad = (s: string) => console.log(`  ${paint(31, "✗")} ${s}`);
const info = (s: string) => console.log(`  ${paint(90, "·")} ${paint(90, s)}`);

type GuessLog = { gameId: bigint; guessCode: number; seed: Hex; traits: Hex; answers: Hex; block: bigint; tx: Hex };
type SettledLog = { gameId: bigint; outcome: number; jobCode: number; fitScore: bigint; fitBps: bigint; block: bigint; tx: Hex };

async function fetchEvents() {
  const latest = await client.getBlockNumber();
  const guesses = new Map<bigint, GuessLog>();
  const settled: SettledLog[] = [];
  for (let from = DEPLOY_BLOCK; from <= latest; from += LOG_CHUNK) {
    const to = from + LOG_CHUNK - 1n > latest ? latest : from + LOG_CHUNK - 1n;
    const [g, s] = await Promise.all([
      client.getContractEvents({ address: VAULT, abi: vaultAbi, eventName: "GuessSubmitted", fromBlock: from, toBlock: to }),
      client.getContractEvents({ address: VAULT, abi: vaultAbi, eventName: "Settled", fromBlock: from, toBlock: to }),
    ]);
    for (const e of g) {
      guesses.set(e.args.gameId!, {
        gameId: e.args.gameId!,
        guessCode: e.args.guessCode!,
        seed: e.args.seed!,
        traits: e.args.traits!,
        answers: e.args.answers!,
        block: e.blockNumber,
        tx: e.transactionHash,
      });
    }
    for (const e of s) {
      settled.push({
        gameId: e.args.gameId!,
        outcome: Number(e.args.outcome),
        jobCode: e.args.jobCode!,
        fitScore: e.args.fitScore!,
        fitBps: e.args.fitBps!,
        block: e.blockNumber,
        tx: e.transactionHash,
      });
    }
  }
  return { guesses, settled };
}

function priorFromChain(settled: SettledLog[], startBlock: bigint): { counts: PriorCounts; games: number } {
  const counts: PriorCounts = {};
  let games = 0;
  for (const s of settled) {
    if (s.block < startBlock && PRIOR_OUTCOMES.has(s.outcome)) {
      counts[s.jobCode] = (counts[s.jobCode] ?? 0) + 1;
      games++;
    }
  }
  return { counts, games };
}

async function priorFromGraph(startBlock: bigint): Promise<PriorCounts | null> {
  if (!SUBGRAPH_URL) return null;
  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query($b: BigInt!) { games(first: 1000, where: { settledBlock_lt: $b, outcome_in: [AgentWin, Push, PlayerWin] }) { jobCode } }`,
        variables: { b: startBlock.toString() },
      }),
    });
    const json = (await res.json()) as { data?: { games: { jobCode: number }[] } };
    if (!json.data) return null;
    const counts: PriorCounts = {};
    for (const g of json.data.games) counts[g.jobCode] = (counts[g.jobCode] ?? 0) + 1;
    return counts;
  } catch {
    return null;
  }
}

const sameCounts = (a: PriorCounts, b: PriorCounts) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[Number(k)] ?? 0) === (b[Number(k)] ?? 0));
};

const title = (code: number) => jobByCode(code)?.title ?? `code ${code}`;

async function replayGame(gameId: bigint, events: Awaited<ReturnType<typeof fetchEvents>>): Promise<boolean> {
  const [, , , seedCommit, , , startBlock, , guessCode, , , status] = await client.readContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "games",
    args: [gameId],
  });
  const settledLog = events.settled.find((s) => s.gameId === gameId);
  const guess = events.guesses.get(gameId);

  const headline = settledLog
    ? `sealed ${settledLog.jobCode ? title(settledLog.jobCode) : "(never revealed)"} · Seer guessed ${title(guessCode)} · ${OUTCOMES[settledLog.outcome]}`
    : guess
      ? `Seer guessed ${title(guessCode)} · awaiting reveal`
      : "no guess yet";
  console.log(`\n${paint(33, `Game #${gameId}`)} · ${headline}`);

  if (status === 0) {
    bad("game does not exist");
    return false;
  }
  if (!guess) {
    info("the Seer has not guessed (or the game was refunded), so there is nothing to replay yet");
    return true;
  }

  let pass = true;
  const check = (cond: boolean, yes: string, no: string) => {
    (cond ? ok : bad)(cond ? yes : no);
    pass &&= cond;
  };

  // 2. seed commitment
  const commit = keccak256(encodeAbiParameters([{ type: "bytes32" }], [guess.seed]));
  check(commit === seedCommit, "seed matches the commitment made before play", `seed does not match its commitment (${commit} ≠ ${seedCommit})`);

  // 3. prior as of the start block
  const { counts, games } = priorFromChain(events.settled, startBlock);
  ok(`prior rebuilt from ${games} earlier settled game${games === 1 ? "" : "s"} on-chain (before block ${startBlock})`);
  const graphCounts = await priorFromGraph(startBlock);
  if (graphCounts === null) info("The Graph cross-check skipped (subgraph unavailable)");
  else check(sameCounts(counts, graphCounts), "The Graph reports the same history", "The Graph's history differs from on-chain events");
  const prior = priorFrom(counts);

  // 4. re-run the solver
  const answers = unpackAnswers(guess.answers);
  const published = unpackAnswers(guess.traits) as number[];
  const { askedTraits } = replay(guess.seed, answers as Answer[], prior);
  const firstMismatch = askedTraits.findIndex((t, k) => t !== published[k]);
  check(
    firstMismatch === -1,
    `questions 1–${askedTraits.length} match the Seer's published transcript`,
    `question ${firstMismatch + 1} differs: solver asks trait ${askedTraits[firstMismatch]}, Seer published ${published[firstMismatch]}`,
  );
  const replayed = finalGuess(guess.seed, answers as Answer[], prior);
  check(
    replayed.code === guess.guessCode && guessCode === guess.guessCode,
    `final guess matches: ${replayed.title}`,
    `final guess differs: solver says ${replayed.title}, Seer posted ${title(guess.guessCode)}`,
  );

  // 5. answer-fit verdict
  if (settledLog && settledLog.outcome !== 1 && settledLog.jobCode !== 0) {
    const local = consistency(settledLog.jobCode, published, answers as Answer[]);
    const [chainScore, chainBps] = await client.readContract({
      address: VAULT,
      abi: vaultAbi,
      functionName: "fit",
      args: [settledLog.jobCode, guess.traits, guess.answers],
    });
    const localScore = Number.isFinite(local.score) ? BigInt(local.score) : chainScore;
    check(
      localScore === settledLog.fitScore && chainScore === settledLog.fitScore && BigInt(local.fitBps) === settledLog.fitBps && chainBps === settledLog.fitBps,
      `fit score ${settledLog.fitScore} (${Number(settledLog.fitBps) / 100}% of prize) matches this repo's scorer and the contract`,
      `fit verdict differs: recorded ${settledLog.fitScore}/${settledLog.fitBps}, repo ${local.score}/${local.fitBps}, contract ${chainScore}/${chainBps}`,
    );
  } else if (settledLog?.outcome === 1) {
    info("the Seer named the job exactly, so no fit check was needed");
  }

  if (settledLog) info(`settlement tx https://testnet.arcscan.app/tx/${settledLog.tx}`);
  console.log(
    pass
      ? `  ${paint(32, "The Seer played this game exactly by its published algorithm.")}`
      : `  ${paint(31, "This game does NOT match the published algorithm.")}`,
  );
  return pass;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: node scripts/replay.ts <gameId | all>");
    process.exit(2);
  }

  console.log(paint(90, `vault ${VAULT} on ${RPC_URL}`));

  // 1. matrix in this repo is the one the contract was built with
  const localHash = keccak256(toBytes(readFileSync(new URL("../lib/matrix.json", import.meta.url))));
  const chainHash = await client.readContract({ address: VAULT, abi: vaultAbi, functionName: "MATRIX_HASH" });
  if (localHash !== chainHash) {
    bad(`web/lib/matrix.json (${localHash}) is not the matrix committed on-chain (${chainHash})`);
    process.exit(1);
  }
  ok(`matrix.json matches the on-chain MATRIX_HASH (${JOBS.length} jobs)`);

  const events = await fetchEvents();
  const ids =
    arg === "all"
      ? [...events.guesses.keys()].sort((a, b) => (a < b ? -1 : 1))
      : [BigInt(arg)];
  if (ids.length === 0) {
    info("no guessed games to replay yet");
    return;
  }

  let failures = 0;
  for (const id of ids) if (!(await replayGame(id, events))) failures++;

  console.log(
    failures === 0
      ? `\n${paint(32, `All ${ids.length} game${ids.length === 1 ? "" : "s"} verified.`)}`
      : `\n${paint(31, `${failures} of ${ids.length} games failed verification.`)}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
