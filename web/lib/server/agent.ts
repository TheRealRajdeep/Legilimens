import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { vaultAbi } from "@/lib/abi";
import { chain, VAULT_ADDRESS } from "@/lib/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export const publicClient = createPublicClient({ chain, transport: http() });

let _account: ReturnType<typeof privateKeyToAccount> | undefined;
export function agentAccount() {
  _account ??= privateKeyToAccount(required("AGENT_PRIVATE_KEY") as Hex);
  return _account;
}

export function agentWallet() {
  return createWalletClient({ account: agentAccount(), chain, transport: http() });
}

const secretHash = () => keccak256(toBytes(required("AGENT_SEED_SECRET")));

/** Stateless per-game seed: the server can always re-derive it from on-chain data, so no database is needed. */
export function deriveSeed(jobCommit: Hex, playerKey: Hex): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }], [secretHash(), jobCommit, playerKey]),
  );
}

export function commitSeed(seed: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }], [seed]));
}

/** Mirrors LegilimensVault.startDigest: EIP-191 over abi.encode(chainid, vault, player, jobCommit, seedCommit, playerKey, expiry). */
export async function signStart(args: {
  player: Address;
  jobCommit: Hex;
  seedCommit: Hex;
  playerKey: Hex;
  expiry: bigint;
}): Promise<Hex> {
  const inner = keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
      ],
      [BigInt(chain.id), VAULT_ADDRESS, args.player, args.jobCommit, args.seedCommit, args.playerKey, args.expiry],
    ),
  );
  return agentAccount().signMessage({ message: { raw: inner } });
}

export type OnchainGame = {
  player: Address;
  stake: bigint;
  jobCommit: Hex;
  seedCommit: Hex;
  /** Daily-quota key, keccak256 of the player's wallet. The vault names it nullifierHash. */
  playerKey: Hex;
  startedAt: bigint;
  startBlock: bigint;
  guessedAt: bigint;
  guessCode: number;
  traits: Hex;
  answers: Hex;
  status: number;
};

export async function readGame(gameId: bigint): Promise<OnchainGame> {
  const [player, stake, jobCommit, seedCommit, playerKey, startedAt, startBlock, guessedAt, guessCode, traits, answers, status] =
    await publicClient.readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: "games", args: [gameId] });
  return { player, stake, jobCommit, seedCommit, playerKey, startedAt, startBlock, guessedAt, guessCode, traits, answers, status };
}
