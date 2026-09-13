import { arcTestnet } from "viem/chains";

// NEXT_PUBLIC_RPC_URL lets local development point at an anvil node started with --chain-id 5042002.
const rpcOverride = process.env.NEXT_PUBLIC_RPC_URL;
export const chain = rpcOverride
  ? { ...arcTestnet, rpcUrls: { default: { http: [rpcOverride] } } }
  : arcTestnet;

// Vault address, subgraph and the Seer's identity are resolved from ENS at runtime: see lib/server/booth.ts.

export const explorerTx = (hash: string) => `${chain.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (address: string) => `${chain.blockExplorers.default.url}/address/${address}`;

export enum GameStatus {
  None = 0,
  Open = 1,
  Guessed = 2,
  Settled = 3,
}

export enum Outcome {
  None = 0,
  AgentWin = 1,
  Push = 2,
  PlayerWin = 3,
  Forfeit = 4,
  Refund = 5,
  /** Answers didn't fit the sealed job (or the job isn't in the ledger): stake forfeited. */
  Inconsistent = 6,
}
