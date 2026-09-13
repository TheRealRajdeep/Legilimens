import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { chain } from "@/lib/config";
import { SEPOLIA_RPC } from "@/lib/ens";

/** Arc testnet: the game, the vault, the Seer's guesses. */
export const publicClient = createPublicClient({ chain, transport: http() });

/** Sepolia: ENSv2, where the Seer's identity, config and players' reputation live. */
export const ensClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
