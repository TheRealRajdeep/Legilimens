"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { parseEventLogs, type Hex } from "viem";
import { useConnect, useConnection, useConnectors, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { vaultAbi } from "@/lib/abi";
import { chain, GameStatus, Outcome, VAULT_ADDRESS } from "@/lib/config";
import { forgetSeal, jobCommitment, latestSeal, newSalt, saveSeal, type SealedGame } from "@/lib/commit";
import { shortAddress, usdc } from "@/lib/format";
import { jobByCode, QUESTION_BUDGET, type Job } from "@/lib/solver";
import { useVault } from "@/hooks/useVault";
import { Candle } from "../props/Candle";
import { Cauldron } from "../props/Cauldron";
import { Coins } from "../props/Coins";
import { ScryingOrb } from "../props/ScryingOrb";
import { Seer } from "../props/Seer";
import { WaxSeal } from "../props/WaxSeal";
import { api, withRetry, type Eligibility, type GuessResult, type Question } from "./api";
import { JobPicker } from "./JobPicker";
import { QuestionCard } from "./QuestionCard";
import { RecentGames } from "./RecentGames";
import { Button, ErrorNote, Scroll, TxLink, Whisper } from "./ui";
import { WorldGate } from "./WorldGate";

type Stage = "landing" | "verify" | "seal" | "questions" | "guess" | "result";

type Settlement = { outcome: Outcome; payout: bigint; guessCode: number; jobCode: number; txHash: Hex };

const delay = (i: number) => ({ "--i": i }) as CSSProperties;

export function Booth() {
  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const switchChain = useSwitchChain();
  const write = useWriteContract();
  const client = usePublicClient();
  const vault = useVault();

  const [stage, setStage] = useState<Stage>("landing");
  const [eligibility, setEligibility] = useState<Eligibility>();
  const [job, setJob] = useState<Job>();
  const [sealState, setSealState] = useState<"unsealed" | "stamping" | "sealed" | "cracked">("unsealed");
  const [game, setGame] = useState<SealedGame>();
  const [startTx, setStartTx] = useState<Hex>();
  const [question, setQuestion] = useState<Question>();
  const [guess, setGuess] = useState<GuessResult>();
  const [settlement, setSettlement] = useState<Settlement>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fail = (err: unknown) => {
    const message = err instanceof Error ? (err as Error & { shortMessage?: string }).shortMessage ?? err.message : String(err);
    setError(message.split("\n")[0]);
    setBusy(null);
  };

  // Resume an unfinished game after a reload, using the salt kept in this browser.
  useEffect(() => {
    if (!address || !client || game) return;
    const seal = latestSeal(address);
    if (!seal) return;
    client
      .readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: "games", args: [BigInt(seal.gameId)] })
      .then((g) => {
        const status = g[10];
        const resumedJob = jobByCode(seal.jobCode);
        if (status === GameStatus.Open) {
          setGame(seal);
          setJob(resumedJob);
          setSealState("sealed");
          setStage("questions");
        } else if (status === GameStatus.Guessed) {
          setGame(seal);
          setJob(resumedJob);
          setSealState("sealed");
          setGuess({ guessCode: g[8], title: jobByCode(g[8])?.title ?? "Unknown", txHash: null });
          setStage("guess");
        } else if (status === GameStatus.Settled) {
          forgetSeal(seal.gameId);
        }
      })
      .catch(() => {});
  }, [address, client, game]);

  // ---------- landing ----------

  async function challenge() {
    setError(null);
    try {
      if (!isConnected) {
        const injectedConnector = connectors[0];
        if (!injectedConnector) throw new Error("No browser wallet found. Install MetaMask or Rabby to play.");
        await connect.mutateAsync({ connector: injectedConnector, chainId: chain.id });
      } else if (chainId !== chain.id) {
        await switchChain.mutateAsync({ chainId: chain.id });
      }
      setStage("verify");
    } catch (err) {
      fail(err);
    }
  }

  // ---------- seal ----------

  async function sealAndStake() {
    if (!address || !job || !eligibility || !client || vault.stake === undefined) return;
    setError(null);
    try {
      if (chainId !== chain.id) await switchChain.mutateAsync({ chainId: chain.id });
      setBusy("The Seer is committing to its seed…");
      const salt = newSalt();
      const jobCommit = jobCommitment(job.code, salt);
      const auth = await api.start({ player: address, nullifierHash: eligibility.nullifierHash, token: eligibility.token, jobCommit });

      setBusy("Confirm the stake in your wallet…");
      const hash = await write.mutateAsync({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "startGame",
        args: [jobCommit, auth.seedCommit, eligibility.nullifierHash, BigInt(auth.expiry), auth.sig],
        value: vault.stake,
      });
      setSealState("stamping");
      setBusy("Pressing the wax…");
      const receipt = await client.waitForTransactionReceipt({ hash });
      const [started] = parseEventLogs({ abi: vaultAbi, logs: receipt.logs, eventName: "GameStarted" });
      if (!started) throw new Error("The stake went through but no game was recorded. Check the transaction.");

      const sealed: SealedGame = { gameId: started.args.gameId.toString(), jobCode: job.code, salt, answers: [], player: address };
      saveSeal(sealed);
      setGame(sealed);
      setStartTx(hash);
      setSealState("sealed");
      setBusy(null);
      vault.refetch();
      setTimeout(() => setStage("questions"), 1100);
    } catch (err) {
      setSealState("unsealed");
      fail(err);
    }
  }

  // ---------- questions ----------

  const loadQuestion = useCallback(async (g: SealedGame) => {
    setBusy("thinking");
    try {
      setQuestion(await withRetry(() => api.question(g.gameId, g.answers)));
      setBusy(null);
    } catch (err) {
      fail(err);
    }
  }, []);

  useEffect(() => {
    if (stage === "questions" && game && game.answers.length < QUESTION_BUDGET && !question && !busy) loadQuestion(game);
  }, [stage, game, question, busy, loadQuestion]);

  const answer = useCallback(
    async (value: number) => {
      if (!game || busy) return;
      const next = { ...game, answers: [...game.answers, value] };
      saveSeal(next);
      setGame(next);
      setQuestion(undefined);
      if (next.answers.length < QUESTION_BUDGET) {
        loadQuestion(next);
        return;
      }
      setStage("guess");
      setBusy("The Seer gazes into the orb…");
      try {
        setGuess(await withRetry(() => api.guess(next.gameId, next.answers)));
        setBusy(null);
        vault.refetch();
      } catch (err) {
        fail(err);
      }
    },
    [game, busy, loadQuestion, vault],
  );

  // ---------- reveal ----------

  async function breakSeal() {
    if (!game || !client) return;
    setError(null);
    try {
      setBusy("Confirm the reveal in your wallet…");
      const hash = await write.mutateAsync({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "reveal",
        args: [BigInt(game.gameId), game.jobCode, game.salt],
      });
      setBusy("The seal cracks…");
      const receipt = await client.waitForTransactionReceipt({ hash });
      const [settled] = parseEventLogs({ abi: vaultAbi, logs: receipt.logs, eventName: "Settled" });
      if (!settled) throw new Error("Reveal confirmed but no settlement event was found.");
      setSettlement({
        outcome: settled.args.outcome as Outcome,
        payout: settled.args.payout,
        guessCode: settled.args.guessCode,
        jobCode: settled.args.jobCode,
        txHash: hash,
      });
      setSealState("cracked");
      forgetSeal(game.gameId);
      setBusy(null);
      vault.refetch();
      setStage("result");
    } catch (err) {
      fail(err);
    }
  }

  function playAgain() {
    setGame(undefined);
    setJob(undefined);
    setGuess(undefined);
    setSettlement(undefined);
    setQuestion(undefined);
    setStartTx(undefined);
    setSealState("unsealed");
    setError(null);
    setStage(eligibility && eligibility.expiresAt > Date.now() / 1000 ? "seal" : "verify");
  }

  // ---------- render ----------

  return (
    <main className="min-h-dvh">
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <button onClick={() => stage !== "questions" && stage !== "guess" && setStage("landing")} className="brand text-2xl text-parchment">
          Guessworker
        </button>
        <div className="flex items-center gap-5 text-(length:--text-whisper) text-faded">
          {stage !== "landing" ? <Cauldron pot={vault.pot} stake={vault.stake} size="sm" /> : null}
          {address ? <span title={address}>{shortAddress(address)}</span> : null}
        </div>
      </header>

      {error ? (
        <div className="mx-auto max-w-3xl px-6">
          <ErrorNote message={error} onDismiss={() => setError(null)} />
        </div>
      ) : null}

      {stage === "landing" ? (
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-6 md:grid-cols-[1.1fr_0.9fr] md:px-10">
          <div className="space-y-7">
            <p className="rise text-(length:--text-whisper) uppercase tracking-[0.3em] text-verdigris">Step right up</p>
            <h1 className="brand rise text-(length:--text-marquee) leading-[0.95] text-parchment" style={delay(1)}>
              The Seer will
              <br />
              name your trade.
            </h1>
            <p className="rise max-w-xl text-(length:--text-lead) text-parchment/90" style={delay(2)}>
              Seal your job in wax. Answer ten questions. If the Seer names it, it keeps your coin. If it can&rsquo;t, you take
              half the pot.
            </p>
            <div className="rise flex flex-wrap items-center gap-5" style={delay(3)}>
              <Button onClick={challenge} disabled={connect.isPending || switchChain.isPending}>
                Challenge the Seer · {vault.stake !== undefined ? usdc(vault.stake) : "1.00"} USDC
              </Button>
              <a href="#rules" className="text-(length:--text-whisper) text-faded underline decoration-faded/40 underline-offset-4 hover:text-parchment">
                How the booth stays honest
              </a>
            </div>
            <div className="rise pt-4" style={delay(4)}>
              <Candle runwayGames={vault.runwayGames} balance={vault.agentBalance} />
            </div>
          </div>

          <div className="rise flex flex-col items-center gap-2" style={delay(2)}>
            <Seer mood="idle" size={250} />
            <div className="-mt-16 relative z-10">
              <Cauldron pot={vault.pot} stake={vault.stake} />
            </div>
          </div>

          <dl id="rules" className="rise grid gap-x-10 gap-y-5 border-t border-ember/25 pt-8 text-(length:--text-whisper) md:col-span-2 md:grid-cols-3" style={delay(5)}>
            <div>
              <dt className="brand text-(length:--text-lead) text-ember">Sealed before the first question</dt>
              <dd className="text-faded">Your job is hashed on-chain with a secret salt. You can&rsquo;t change it, and the Seer can&rsquo;t see it.</dd>
            </div>
            <div>
              <dt className="brand text-(length:--text-lead) text-ember">The Seer commits too</dt>
              <dd className="text-faded">Its question seed is committed before you play and published with its guess, so every game can be replayed.</dd>
            </div>
            <div>
              <dt className="brand text-(length:--text-lead) text-ember">The contract settles</dt>
              <dd className="text-faded">
                Exact trade: the Seer wins. Right family, wrong trade: 90% back. Miss: your stake plus half the pot.
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {stage === "landing" || stage === "result" ? <RecentGames /> : null}

      {stage === "verify" && address ? (
        <WorldGate
          player={address}
          onVerified={(e) => {
            setEligibility(e);
            setStage("seal");
          }}
        />
      ) : null}

      {stage === "seal" ? (
        <section className="mx-auto grid max-w-5xl gap-10 px-6 py-10 md:grid-cols-[1fr_auto] md:items-start">
          <Scroll className="p-6 md:p-10">
            <h2 className="brand mb-2 text-(length:--text-title) leading-none text-quill">Seal your trade</h2>
            <p className="mb-6 text-quill/80">Pick the job you&rsquo;ll answer as. Only its hash leaves this page.</p>
            <JobPicker selected={job} onSelect={setJob} />
          </Scroll>
          <aside className="flex flex-col items-center gap-5 md:sticky md:top-10 md:w-64">
            <WaxSeal state={sealState} label={sealState === "unsealed" ? undefined : job?.title} />
            <div className="text-center">
              <p className="text-(length:--text-lead) text-parchment">{job ? job.title : "No trade chosen"}</p>
              <Whisper>Stake: {usdc(vault.stake)} USDC · lost if the Seer names it exactly</Whisper>
            </div>
            <Button onClick={sealAndStake} disabled={!job || Boolean(busy) || sealState !== "unsealed"} className="w-full">
              {busy ?? "Seal it & stake"}
            </Button>
            {startTx ? <TxLink hash={startTx} label="Sealed on Arc" /> : null}
          </aside>
        </section>
      ) : null}

      {stage === "questions" ? <QuestionCard question={question} loading={busy === "thinking" || !question} onAnswer={answer} /> : null}

      {stage === "guess" ? (
        <section className="mx-auto flex max-w-3xl flex-col items-center gap-10 px-6 py-10 text-center">
          <ScryingOrb vision={guess?.title} />
          <div className="space-y-3 pt-4">
            {guess ? (
              <>
                <p className="text-(length:--text-lead) text-parchment">
                  &ldquo;You are a <span className="brand text-ember">{guess.title}</span>. I am never wrong.&rdquo;
                </p>
                <Whisper>
                  The guess and its seed are now on-chain.{" "}
                  {guess.txHash ? <TxLink hash={guess.txHash} label="See the Seer's transaction" /> : null}
                </Whisper>
              </>
            ) : (
              <p className="text-(length:--text-lead) italic text-faded">{busy ?? "The mists gather…"}</p>
            )}
          </div>
          {guess ? (
            <div className="flex flex-col items-center gap-4">
              <WaxSeal state={sealState} label={job?.title} />
              <Button onClick={breakSeal} disabled={Boolean(busy)}>
                {busy ?? "Break the seal"}
              </Button>
              <Whisper>Revealing proves what you sealed. Walk away and the stake goes to the pot after 30 minutes.</Whisper>
            </div>
          ) : null}
        </section>
      ) : null}

      {stage === "result" && settlement ? (
        <ResultView settlement={settlement} startTx={startTx} gameId={game?.gameId} onAgain={playAgain} />
      ) : null}
    </main>
  );
}

function ResultView({
  settlement,
  startTx,
  gameId,
  onAgain,
}: {
  settlement: Settlement;
  startTx?: Hex;
  gameId?: string;
  onAgain: () => void;
}) {
  const sealed = jobByCode(settlement.jobCode)?.title ?? "your trade";
  const guessed = jobByCode(settlement.guessCode)?.title ?? "something";
  const view = {
    [Outcome.AgentWin]: {
      mood: "triumphant" as const,
      color: "text-hex",
      title: "Read like an open book.",
      line: `You sealed ${sealed}. The Seer named it. Your stake joins the pot.`,
    },
    [Outcome.Push]: {
      mood: "confident" as const,
      color: "text-ember",
      title: "Close enough to sting.",
      line: `You sealed ${sealed}; the Seer said ${guessed}. Same family of trades: ${usdc(settlement.payout)} USDC returns to you.`,
    },
    [Outcome.PlayerWin]: {
      mood: "stumped" as const,
      color: "text-moss",
      title: "The Seer is baffled.",
      line: `You sealed ${sealed}; the Seer said ${guessed}. You take ${usdc(settlement.payout)} USDC from the pot.`,
    },
  }[settlement.outcome as Outcome.AgentWin | Outcome.Push | Outcome.PlayerWin] ?? {
    mood: "idle" as const,
    color: "text-parchment",
    title: "The game is settled.",
    line: "",
  };

  return (
    <section className="relative mx-auto grid max-w-5xl items-center gap-10 px-6 py-12 md:grid-cols-[auto_1fr]" aria-live="assertive">
      {settlement.outcome === Outcome.PlayerWin ? <Coins /> : null}
      <div className="flex flex-col items-center gap-4">
        <Seer mood={view.mood} size={230} />
        <WaxSeal state="cracked" label={sealed} />
      </div>
      <div className="space-y-6">
        <h2 className={`brand text-(length:--text-marquee) leading-[0.95] ${view.color}`}>{view.title}</h2>
        <p className="max-w-prose text-(length:--text-lead) text-parchment">{view.line}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-(length:--text-whisper)">
          {startTx ? <TxLink hash={startTx} label="Seal" /> : null}
          <TxLink hash={settlement.txHash} label="Reveal & payout" />
          {gameId ? <span className="text-faded">Game #{gameId} · replay it with the published seed and answers</span> : null}
        </div>
        <Button onClick={onAgain}>Challenge again</Button>
      </div>
    </section>
  );
}
