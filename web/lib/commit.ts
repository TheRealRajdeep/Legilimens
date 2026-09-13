import { encodeAbiParameters, keccak256, toHex, type Hex } from "viem";

// The player's sealed job never leaves the browser until reveal. Only the commitment goes on-chain.

export function newSalt(): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function jobCommitment(jobCode: number, salt: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "uint16" }, { type: "bytes32" }], [jobCode, salt]));
}

/**
 * The vault's daily quota (3 games a day) is keyed by a bytes32 it calls `nullifierHash`.
 * The booth fills it with the hash of the player's wallet, so the quota is per wallet.
 */
export function playerKey(player: string): Hex {
  return keccak256(player.toLowerCase() as Hex);
}

export type SealedGame = {
  gameId: string;
  jobCode: number;
  salt: Hex;
  answers: number[];
  player: string;
};

const KEY = "guessworker:seals";

function readAll(): Record<string, SealedGame> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveSeal(game: SealedGame) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [game.gameId]: game }));
  } catch {
    // Storage blocked: the game still works in this tab, the salt just won't survive a reload.
  }
}

export function loadSeal(gameId: string): SealedGame | undefined {
  return readAll()[gameId];
}

/** Latest unfinished seal for this player, so a reload mid-game can resume. */
export function latestSeal(player: string): SealedGame | undefined {
  return Object.values(readAll())
    .filter((g) => g.player.toLowerCase() === player.toLowerCase())
    .sort((a, b) => Number(b.gameId) - Number(a.gameId))[0];
}

export function forgetSeal(gameId: string) {
  try {
    const all = readAll();
    delete all[gameId];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}
