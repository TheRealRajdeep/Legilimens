import { arcTestnet } from "viem/chains";
import type { Address } from "viem";

// NEXT_PUBLIC_RPC_URL lets local development point at an anvil node started with --chain-id 5042002.
const rpcOverride = process.env.NEXT_PUBLIC_RPC_URL;
export const chain = rpcOverride
  ? { ...arcTestnet, rpcUrls: { default: { http: [rpcOverride] } } }
  : arcTestnet;

export const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
export const VAULT_DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_VAULT_DEPLOY_BLOCK ?? "0");

export const WORLD_APP_ID = (process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "app_xxxxx") as `app_${string}`;
export const WORLD_ACTION = process.env.NEXT_PUBLIC_WORLD_ACTION ?? "play-guessworker";
export const WORLD_PRESET = (process.env.NEXT_PUBLIC_WORLD_PRESET ?? "selfieCheckLegacy") as
  | "selfieCheckLegacy"
  | "deviceLegacy"
  | "proofOfHuman";
export const WORLD_ENVIRONMENT = (process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT ?? "production") as
  | "production"
  | "staging"
  | "sandbox";

export const PUBLIC_SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL ?? "";

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
}
