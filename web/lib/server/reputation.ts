import { createWalletClient, encodeFunctionData, formatUnits, http, namehash, zeroAddress, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { vaultAbi } from "@/lib/abi";
import { GameStatus } from "@/lib/config";
import { ENS_V2, PLAYER_KEYS, SEPOLIA_RPC, ensAppUrl, labelId, playerLabel, playerName, registryAbi, resolverAbi } from "@/lib/ens";
import { agentAccount, readGame } from "./agent";
import { getBooth } from "./booth";
import { ensClient, publicClient } from "./clients";

/**
 * Players' reputation lives in ENS: <wallet-prefix>.players.legilimens.eth. The player owns the name; only the Seer,
 * through roles the booth owner delegated key by key, can write its legilimens.* records. So the history is theirs
 * to show off and nobody's to forge.
 */

export type Reputation = {
  name: string;
  url: string;
  exists: boolean;
  readings: number;
  named: number;
  close: number;
  baffled: number;
  caughtLying: number;
  lastReading: string;
};

const seerWallet = () => createWalletClient({ chain: sepolia, transport: http(SEPOLIA_RPC), account: agentAccount() });

async function nameExists(label: string): Promise<boolean> {
  const booth = await getBooth();
  if (booth.playersRegistry === zeroAddress) return false;
  const state = await ensClient.readContract({ address: booth.playersRegistry, abi: registryAbi, functionName: "getState", args: [labelId(label)] });
  return state.status === 2 && state.expiry > BigInt(Math.floor(Date.now() / 1000));
}

export async function readReputation(player: Address): Promise<Reputation> {
  const booth = await getBooth();
  const name = playerName(player);
  const [exists, ...values] = await Promise.all([
    nameExists(playerLabel(player)),
    ...PLAYER_KEYS.map((key) => ensClient.readContract({ address: booth.resolver, abi: resolverAbi, functionName: "text", args: [namehash(name), key] })),
  ]);
  const num = (i: number) => Number(values[i] || "0") || 0;
  return {
    name,
    url: ensAppUrl(name),
    exists: exists as boolean,
    readings: num(0),
    named: num(1),
    close: num(2),
    baffled: num(3),
    caughtLying: num(4),
    lastReading: (values[5] as string) || "",
  };
}

type SubgraphPlayer = {
  data?: {
    player: { games: { gameId: string; outcome: string; status: string }[] } | null;
    vaults: { gamesSettled: number; agentWins: number; pushes: number; playerWins: number; inconsistent: number }[];
  };
};

const READINGS = new Set(["AgentWin", "Push", "PlayerWin", "Inconsistent"]);

async function settledHistory(subgraph: string, player: Address, gameId: bigint) {
  // The indexer trails the chain by a few blocks; wait for this game's settlement to appear.
  for (let attempt = 0; attempt < 15; attempt++) {
    const res = await fetch(subgraph, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        query: `query($p: ID!) {
          player(id: $p) { games(first: 1000) { gameId outcome status } }
          vaults(first: 1) { gamesSettled agentWins pushes playerWins inconsistent }
        }`,
        variables: { p: player.toLowerCase() },
      }),
    });
    const json = (await res.json()) as SubgraphPlayer;
    const games = json.data?.player?.games ?? [];
    if (games.some((g) => g.gameId === gameId.toString() && g.status === "Settled")) {
      return { games: games.filter((g) => g.status === "Settled"), vault: json.data!.vaults[0] };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("The ledger hasn't recorded this settlement yet, try again shortly");
}

export type ReadingReceipt = Reputation & { txs: Hex[]; skipped?: boolean };

/** After a game settles, write the player's updated reading (and the Seer's own tally) to ENS. Idempotent. */
export async function recordReading(gameId: bigint): Promise<ReadingReceipt> {
  const booth = await getBooth();
  if (booth.source !== "ens") throw new Error("ENS is not configured for this booth");

  const game = await readGame(gameId);
  if (game.status !== GameStatus.Settled) throw new Error("This game hasn't settled yet");

  const current = await readReputation(game.player);
  const lastId = Number(current.lastReading.match(/^#(\d+)/)?.[1] ?? 0);
  if (lastId >= Number(gameId)) return { ...current, txs: [], skipped: true };

  const { games, vault } = await settledHistory(booth.subgraph, game.player, gameId);
  const count = (outcome: string) => games.filter((g) => g.outcome === outcome).length;
  const latest = games.filter((g) => READINGS.has(g.outcome)).sort((a, b) => Number(b.gameId) - Number(a.gameId))[0];
  const records: Record<(typeof PLAYER_KEYS)[number], string> = {
    "legilimens.readings": String(games.filter((g) => READINGS.has(g.outcome)).length),
    "legilimens.named": String(count("AgentWin")),
    "legilimens.close": String(count("Push")),
    "legilimens.baffled": String(count("PlayerWin")),
    "legilimens.caughtLying": String(count("Inconsistent")),
    "legilimens.lastReading": latest ? `#${latest.gameId} ${latest.outcome}` : "",
  };

  // The Seer's own tally and runway, on its own name.
  const [agentBalance, opCost, nextId] = await Promise.all([
    publicClient.getBalance({ address: booth.seerAddress }),
    publicClient.readContract({ address: booth.vault, abi: vaultAbi, functionName: "agentOperatingCost" }),
    publicClient.readContract({ address: booth.vault, abi: vaultAbi, functionName: "nextGameId" }),
  ]);
  const perGame = nextId > 1n ? opCost / (nextId - 1n) : 0n;
  const runway = perGame > 0n ? (agentBalance / perGame).toString() : "";
  const seerRecords: [string, string][] = [
    ["legilimens.readings", String(vault?.gamesSettled ?? 0)],
    [
      "legilimens.record",
      `named ${vault?.agentWins ?? 0} · close ${vault?.pushes ?? 0} · baffled ${vault?.playerWins ?? 0} · caught lying ${vault?.inconsistent ?? 0}`,
    ],
    ["legilimens.runway", runway ? `${runway} games (${Number(formatUnits(agentBalance, 18)).toFixed(2)} USDC)` : ""],
  ];

  const wallet = seerWallet();
  const label = playerLabel(game.player);
  const node = namehash(playerName(game.player));
  let nonce = await ensClient.getTransactionCount({ address: agentAccount().address, blockTag: "pending" });
  const txs: Hex[] = [];

  if (!current.exists) {
    // The player owns their name but holds no roles on it, so they can't repoint the resolver and escape their record.
    const expires = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);
    txs.push(
      await wallet.sendTransaction({
        to: booth.playersRegistry,
        nonce: nonce++,
        data: encodeFunctionData({ abi: registryAbi, functionName: "register", args: [label, game.player, zeroAddress, booth.resolver, 0n, expires] }),
      }),
    );
  }

  const seerNode = namehash(booth.seerName);
  const calls = [
    ...Object.entries(records).map(([key, value]) => encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [node, key, value] })),
    ...seerRecords.map(([key, value]) => encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [seerNode, key, value] })),
  ];
  txs.push(
    await wallet.sendTransaction({
      to: booth.resolver,
      nonce: nonce++,
      data: encodeFunctionData({ abi: resolverAbi, functionName: "multicall", args: [calls] }),
    }),
  );

  const receipts = await Promise.all(txs.map((hash) => ensClient.waitForTransactionReceipt({ hash, timeout: 50_000 })));
  const failed = receipts.find((r) => r.status !== "success");
  if (failed) throw new Error(`ENS write reverted: ${failed.transactionHash}`);

  return {
    name: playerName(game.player),
    url: ensAppUrl(playerName(game.player)),
    exists: true,
    readings: Number(records["legilimens.readings"]),
    named: Number(records["legilimens.named"]),
    close: Number(records["legilimens.close"]),
    baffled: Number(records["legilimens.baffled"]),
    caughtLying: Number(records["legilimens.caughtLying"]),
    lastReading: records["legilimens.lastReading"],
    txs,
  };
}

export { ENS_V2 };
