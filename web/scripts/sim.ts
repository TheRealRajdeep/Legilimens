// Monte Carlo calibration: node scripts/sim.ts [games=4000] [questions]
import { JOBS, QUESTION_BUDGET, finalGuess, nextQuestion, priorFrom, sampleAnswer, type Answer } from "../lib/solver.ts";

const N = Number(process.argv[2] ?? 4000);
const prior = priorFrom();

let seedState = 42;
const rand = () => {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
};

const perJob = new Map<number, { games: number; exact: number; push: number; miss: number }>();
let exact = 0;
let push = 0;
let miss = 0;

for (let g = 0; g < N; g++) {
  const jobIndex = Math.floor(rand() * JOBS.length);
  const job = JOBS[jobIndex];
  const seed = `0x${g.toString(16).padStart(64, "0")}`;
  const answers: Answer[] = [];
  for (let q = 0; q < QUESTION_BUDGET; q++) {
    const next = nextQuestion(seed, answers, prior)!;
    answers.push(sampleAnswer(jobIndex, next.traitIndex, rand));
  }
  const guess = finalGuess(seed, answers, prior);
  const stat = perJob.get(job.code) ?? { games: 0, exact: 0, push: 0, miss: 0 };
  stat.games++;
  if (guess.code === job.code) {
    exact++;
    stat.exact++;
  } else if (Math.floor(guess.code / 10) === Math.floor(job.code / 10)) {
    push++;
    stat.push++;
  } else {
    miss++;
    stat.miss++;
  }
  perJob.set(job.code, stat);
}

const pct = (x: number) => `${((100 * x) / N).toFixed(1)}%`;
console.log(`games=${N} questions=${QUESTION_BUDGET} jobs=${JOBS.length}`);
console.log(`agent exact ${pct(exact)} | push ${pct(push)} | player wins ${pct(miss)}`);

const hardest = [...perJob.entries()]
  .map(([code, s]) => ({ code, title: JOBS.find((j) => j.code === code)!.title, missRate: s.miss / s.games }))
  .sort((a, b) => b.missRate - a.missRate)
  .slice(0, 8);
console.log("\nHardest jobs for the Seer (use for the player-win demo take):");
for (const h of hardest) console.log(`  ${h.code} ${h.title.padEnd(24)} miss ${(100 * h.missRate).toFixed(0)}%`);
