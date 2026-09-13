import matrix from "./matrix.json" with { type: "json" };

// Answer codes match the on-chain transcript byte: 0 = No, 1 = Probably Not, 2 = Probably, 3 = Yes.
export type Answer = 0 | 1 | 2 | 3;
export const ANSWER_LABELS = ["No", "Probably Not", "Probably", "Yes"] as const;

export const QUESTION_BUDGET = 10;
export const SOFTMAX_TEMPERATURE = 0.03; // in bits; lower = closer to pure argmax. Calibrated with scripts/sim.ts

export type Job = { code: number; title: string; p: string };
export type Trait = { id: string; question: string };

export const TRAITS: Trait[] = matrix.traits;
export const JOBS: Job[] = matrix.jobs;

const P: number[][] = JOBS.map((job) => {
  if (job.p.length !== TRAITS.length) {
    throw new Error(`matrix: ${job.title} has ${job.p.length} traits, expected ${TRAITS.length}`);
  }
  return [...job.p].map((d) => Math.min(0.97, Math.max(0.03, Number(d) / 9)));
});

/**
 * P(answer | job has trait with probability p). Each row sums to 1.
 * Honest people mostly answer Yes/No; "Probably" answers carry a weaker, same-direction signal.
 */
export function answerLikelihood(answer: Answer, p: number): number {
  switch (answer) {
    case 3:
      return 0.75 * p + 0.0125;
    case 2:
      return 0.2 * p + 0.0125;
    case 1:
      return 0.2 * (1 - p) + 0.0125;
    case 0:
      return 0.75 * (1 - p) + 0.0125;
  }
}

/** Job-code → count of past settled games for that job. Missing codes count as zero. */
export type PriorCounts = Record<number, number>;

export function priorFrom(counts: PriorCounts = {}): number[] {
  // Laplace-smoothed frequencies, so an unseen job is never impossible.
  const raw = JOBS.map((job) => 1 + (counts[job.code] ?? 0));
  return normalize(raw);
}

function normalize(xs: number[]): number[] {
  const total = xs.reduce((a, b) => a + b, 0);
  return xs.map((x) => x / total);
}

function entropy(dist: number[]): number {
  let h = 0;
  for (const x of dist) if (x > 0) h -= x * Math.log2(x);
  return h;
}

function update(posterior: number[], traitIndex: number, answer: Answer): number[] {
  return normalize(posterior.map((w, j) => w * answerLikelihood(answer, P[j][traitIndex])));
}

function expectedGain(posterior: number[], traitIndex: number): number {
  const h = entropy(posterior);
  let expected = 0;
  for (const a of [0, 1, 2, 3] as Answer[]) {
    const pA = posterior.reduce((sum, w, j) => sum + w * answerLikelihood(a, P[j][traitIndex]), 0);
    if (pA > 0) expected += pA * entropy(update(posterior, traitIndex, a));
  }
  return h - expected;
}

// xmur3 string hash → mulberry32 PRNG. Tiny, dependency-free, identical in every JS runtime.
function rngFor(seed: string, step: number): () => number {
  const str = `${seed.toLowerCase()}:${step}`;
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  let a = (h ^= h >>> 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type GameState = {
  askedTraits: number[];
  posterior: number[];
};

/**
 * Replays the whole game deterministically from seed + answers. Questions are never stored:
 * given the same matrix, prior, seed and answers, every runtime derives the same sequence.
 */
export function replay(seed: string, answers: Answer[], prior: number[]): GameState {
  let posterior = prior;
  const askedTraits: number[] = [];
  for (let step = 0; step < answers.length; step++) {
    const trait = pickTrait(seed, step, posterior, askedTraits);
    askedTraits.push(trait);
    posterior = update(posterior, trait, answers[step]);
  }
  return { askedTraits, posterior };
}

function pickTrait(seed: string, step: number, posterior: number[], asked: number[]): number {
  const candidates = TRAITS.map((_, i) => i).filter((i) => !asked.includes(i));
  const gains = candidates.map((i) => expectedGain(posterior, i));
  const best = Math.max(...gains);
  const weights = gains.map((g) => Math.exp((g - best) / SOFTMAX_TEMPERATURE));
  const total = weights.reduce((a, b) => a + b, 0);

  let r = rngFor(seed, step)() * total;
  for (let k = 0; k < candidates.length; k++) {
    r -= weights[k];
    if (r <= 0) return candidates[k];
  }
  return candidates[candidates.length - 1];
}

export type NextQuestion = {
  step: number;
  traitIndex: number;
  traitId: string;
  text: string;
  /** Posterior probability of the current front-runner, 0..1. Drives the mascot's mood. */
  confidence: number;
};

export function nextQuestion(seed: string, answers: Answer[], prior: number[]): NextQuestion | null {
  if (answers.length >= QUESTION_BUDGET) return null;
  const { askedTraits, posterior } = replay(seed, answers, prior);
  const traitIndex = pickTrait(seed, answers.length, posterior, askedTraits);
  return {
    step: answers.length,
    traitIndex,
    traitId: TRAITS[traitIndex].id,
    text: TRAITS[traitIndex].question,
    confidence: Math.max(...posterior),
  };
}

export type Guess = { code: number; title: string; confidence: number; askedTraits: number[] };

export function finalGuess(seed: string, answers: Answer[], prior: number[]): Guess {
  const { askedTraits, posterior } = replay(seed, answers, prior);
  let best = 0;
  for (let j = 1; j < posterior.length; j++) if (posterior[j] > posterior[best]) best = j;
  return { code: JOBS[best].code, title: JOBS[best].title, confidence: posterior[best], askedTraits };
}

/** Packs answers into the bytes10 the contract stores, one byte per answer. */
export function packAnswers(answers: Answer[]): `0x${string}` {
  if (answers.length !== QUESTION_BUDGET) throw new Error(`need ${QUESTION_BUDGET} answers`);
  return `0x${answers.map((a) => a.toString(16).padStart(2, "0")).join("")}`;
}

export function unpackAnswers(packed: string): Answer[] {
  const hex = packed.replace(/^0x/, "");
  const out: Answer[] = [];
  for (let i = 0; i < QUESTION_BUDGET * 2; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16) as Answer);
  return out;
}

/** Simulates an honest-but-noisy player answering for a given job. Used by sim and demo prep. */
export function sampleAnswer(jobIndex: number, traitIndex: number, rand: () => number): Answer {
  const p = P[jobIndex][traitIndex];
  let r = rand();
  for (const a of [0, 1, 2, 3] as Answer[]) {
    r -= answerLikelihood(a, p);
    if (r <= 0) return a;
  }
  return 3;
}

export function jobByCode(code: number): Job | undefined {
  return JOBS.find((j) => j.code === code);
}
