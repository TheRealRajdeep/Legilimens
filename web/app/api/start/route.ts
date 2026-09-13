import { isAddress, isHex, type Address, type Hex } from "viem";
import { vaultAbi } from "@/lib/abi";
import { playerKey } from "@/lib/commit";
import { VAULT_ADDRESS } from "@/lib/config";
import { commitSeed, deriveSeed, publicClient, signStart } from "@/lib/server/agent";

type Body = { player?: string; jobCommit?: string };

const SIGNATURE_TTL_SECONDS = 10 * 60;
const MAX_PLAYS_PER_DAY = 3n;

/** The Seer binds itself to a seed for this sealed job and authorises the player to start the game. */
export async function POST(request: Request) {
  const { player, jobCommit } = (await request.json()) as Body;
  if (!player || !isAddress(player)) return Response.json({ error: "invalid player" }, { status: 400 });
  if (!jobCommit || !isHex(jobCommit, { strict: true }) || jobCommit.length !== 66) {
    return Response.json({ error: "invalid jobCommit" }, { status: 400 });
  }

  // The signature binds msg.sender, so it is only usable from the player's own wallet.
  const key = playerKey(player);
  const plays = await publicClient.readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: "playsToday", args: [key] });
  if (plays >= MAX_PLAYS_PER_DAY) {
    return Response.json({ error: "The Seer reads each wallet three times a day. Come back tomorrow." }, { status: 429 });
  }

  const seedCommit = commitSeed(deriveSeed(jobCommit as Hex, key));
  const expiry = BigInt(Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS);
  const sig = await signStart({ player: player as Address, jobCommit: jobCommit as Hex, seedCommit, playerKey: key, expiry });

  return Response.json({ seedCommit, playerKey: key, expiry: expiry.toString(), sig });
}
