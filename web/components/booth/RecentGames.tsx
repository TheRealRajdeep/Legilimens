"use client";

import { useQuery } from "@tanstack/react-query";
import { PUBLIC_SUBGRAPH_URL } from "@/lib/config";
import { shortAddress, usdc } from "@/lib/format";
import { jobByCode } from "@/lib/solver";

type SettledGame = {
  gameId: string;
  player: { id: string };
  outcome: "AgentWin" | "Push" | "PlayerWin" | "Forfeit" | "Refund";
  jobCode: number | null;
  guessCode: number | null;
  payout: string | null;
  settledAt: string;
  settleTx: string;
};

type Stats = { gamesSettled: number; agentWins: number; pushes: number; playerWins: number } | undefined;

const QUERY = `{
  vaults(first: 1) { gamesSettled agentWins pushes playerWins }
  games(first: 8, orderBy: settledAt, orderDirection: desc, where: { status: Settled }) {
    gameId player { id } outcome jobCode guessCode payout settledAt settleTx
  }
}`;

const VERDICT: Record<SettledGame["outcome"], { label: string; tone: string }> = {
  AgentWin: { label: "Seer named it", tone: "text-hex" },
  Push: { label: "Close — 90% back", tone: "text-ember" },
  PlayerWin: { label: "Seer baffled", tone: "text-moss" },
  Forfeit: { label: "Seal never broken", tone: "text-faded" },
  Refund: { label: "Refunded", tone: "text-faded" },
};

function ago(seconds: string): string {
  const diff = Math.max(0, Date.now() / 1000 - Number(seconds));
  if (diff < 90) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  return `${Math.round(diff / 86400)} d ago`;
}

/** The booth's ledger of past readings, straight from The Graph. */
export function RecentGames() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["recent-games"],
    enabled: Boolean(PUBLIC_SUBGRAPH_URL),
    refetchInterval: 15_000,
    queryFn: async () => {
      const res = await fetch(PUBLIC_SUBGRAPH_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: QUERY }),
      });
      const json = (await res.json()) as { data?: { vaults: NonNullable<Stats>[]; games: SettledGame[] } };
      if (!json.data) throw new Error("subgraph unavailable");
      return { stats: json.data.vaults[0] as Stats, games: json.data.games };
    },
  });

  if (!PUBLIC_SUBGRAPH_URL) return null;

  const stats = data?.stats;
  return (
    <section aria-labelledby="ledger-title" className="mx-auto max-w-6xl px-6 pb-24 md:px-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b border-ember/25 pb-3">
        <h2 id="ledger-title" className="brand text-(length:--text-lead) text-parchment">
          The booth&rsquo;s ledger
        </h2>
        {stats ? (
          <p className="text-(length:--text-whisper) text-faded">
            {stats.gamesSettled} readings · Seer named <span className="text-hex">{stats.agentWins}</span> · close{" "}
            <span className="text-ember">{stats.pushes}</span> · baffled <span className="text-moss">{stats.playerWins}</span>
          </p>
        ) : null}
      </div>

      {isLoading ? <p className="py-6 text-(length:--text-whisper) italic text-faded">Reading the ledger…</p> : null}
      {isError ? <p className="py-6 text-(length:--text-whisper) text-faded">The ledger is out of reach right now.</p> : null}
      {data && data.games.length === 0 ? (
        <p className="py-6 text-(length:--text-whisper) text-faded">
          No readings yet. The first challenger&rsquo;s trade will be written here once their seal is broken.
        </p>
      ) : null}

      <ol className="divide-y divide-ember/10">
        {data?.games.map((g) => {
          const sealed = g.jobCode ? jobByCode(g.jobCode)?.title : undefined;
          const guessed = g.guessCode ? jobByCode(g.guessCode)?.title : undefined;
          const verdict = VERDICT[g.outcome];
          return (
            <li key={g.gameId} className="grid grid-cols-[auto_1fr] items-baseline gap-x-5 gap-y-1 py-3 md:grid-cols-[4rem_1fr_auto_auto]">
              <span className="brand text-ember/80">#{g.gameId}</span>
              <span className="text-parchment">
                {sealed ? (
                  <>
                    Sealed <em className="not-italic text-parchment">{sealed}</em>
                    <span className="text-faded"> · the Seer said {guessed ?? "nothing"}</span>
                  </>
                ) : (
                  <span className="text-faded">Trade never revealed</span>
                )}
              </span>
              <span className={`col-start-2 text-(length:--text-whisper) md:col-start-auto ${verdict.tone}`}>
                {verdict.label}
                {g.payout && g.payout !== "0" ? <span className="text-faded"> · paid {usdc(BigInt(g.payout))}</span> : null}
              </span>
              <a
                href={`https://testnet.arcscan.app/tx/${g.settleTx}`}
                target="_blank"
                rel="noreferrer"
                className="col-start-2 text-(length:--text-whisper) text-faded underline decoration-faded/30 underline-offset-4 hover:text-parchment md:col-start-auto"
                title={g.player.id}
              >
                {shortAddress(g.player.id)} · {ago(g.settledAt)} ↗
              </a>
            </li>
          );
        })}
      </ol>
      <p className="pt-3 text-(length:--text-whisper) text-faded/80">
        Indexed by The Graph. The Seer reads this ledger before every game to decide what to ask first.
      </p>
    </section>
  );
}
