// End-to-end smoke test against a local anvil + `pnpm dev`.
// Plays one full game per requested job as an honest (noisy) player and prints the settlement.
//   node scripts/e2e-local.ts [jobCode...]
import { createPublicClient, createWalletClient, defineChain, http, parseEventLogs, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { vaultAbi } from "../lib/abi.ts";
import { jobCommitment, newSalt } from "../lib/commit.ts";
import { JOBS, QUESTION_BUDGET, sampleAnswer } from "../lib/solver.ts";

// LIAR=1 answers every question as a different, unrelated job to check the vault forfeits the stake.
const LIAR = process.env.LIAR === "1";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8546";
const VAULT = (process.env.VAULT ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3") as Hex;
const PLAYER_KEY = (process.env.PLAYER_KEY ?? "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a") as Hex;

const chain = defineChain({ id: 5042002, name: "local-arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(PLAYER_KEY);
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ chain, transport: http(), account });

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${APP}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
  return json as T;
}

let seedState = Date.now() % 100000;
const rand = () => ((seedState = (seedState * 1664525 + 1013904223) % 4294967296) / 4294967296);

async function play(jobCode: number) {
  const jobIndex = JOBS.findIndex((j) => j.code === jobCode);
  const job = JOBS[jobIndex];
  const salt = newSalt();
  const jobCommit = jobCommitment(job.code, salt);
  const auth = await post<{ seedCommit: Hex; playerKey: Hex; expiry: string; sig: Hex }>("/api/start", {
    player: account.address,
    jobCommit,
  });
  const stake = await pub.readContract({ address: VAULT, abi: vaultAbi, functionName: "stake" });
  const startHash = await wallet.writeContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "startGame",
    args: [jobCommit, auth.seedCommit, auth.playerKey, BigInt(auth.expiry), auth.sig],
    value: stake,
  });
  const startReceipt = await pub.waitForTransactionReceipt({ hash: startHash });
  const [started] = parseEventLogs({ abi: vaultAbi, logs: startReceipt.logs, eventName: "GameStarted" });
  const gameId = started.args.gameId.toString();

  const answers: number[] = [];
  const asked: string[] = [];
  for (let i = 0; i < QUESTION_BUDGET; i++) {
    const q = await post<{ traitIndex: number; text: string }>("/api/question", { gameId, answers });
    asked.push(q.text);
    const answerAs = LIAR ? (jobIndex + JOBS.length / 2) % JOBS.length : jobIndex;
    answers.push(sampleAnswer(answerAs, q.traitIndex, rand));
  }
  const guess = await post<{ guessCode: number; title: string; txHash: Hex }>("/api/guess", { gameId, answers });

  const revealHash = await wallet.writeContract({ address: VAULT, abi: vaultAbi, functionName: "reveal", args: [BigInt(gameId), job.code, salt] });
  const revealReceipt = await pub.waitForTransactionReceipt({ hash: revealHash });
  const [settled] = parseEventLogs({ abi: vaultAbi, logs: revealReceipt.logs, eventName: "Settled" });
  const outcome = ["None", "AgentWin", "Push", "PlayerWin", "Forfeit", "Refund", "Inconsistent"][settled.args.outcome];

  console.log(`\n#${gameId} sealed ${job.title} → Seer guessed ${guess.title} → ${outcome}, payout ${Number(settled.args.payout) / 1e18} USDC, fit ${Number(settled.args.fitBps) / 100}% (score ${settled.args.fitScore}), pot ${Number(settled.args.potAfter) / 1e18}${LIAR ? " [liar]" : ""}`);
  console.log(`  first questions: ${asked.slice(0, 3).join(" | ")}`);
}

const codes = process.argv.slice(2).map(Number);
for (const code of codes.length ? codes : [5411, 2431, 3153]) await play(code);
