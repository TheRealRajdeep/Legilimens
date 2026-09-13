import { isAddress, isHex, type Address, type Hex } from "viem";
import { commitSeed, deriveSeed, signStart } from "@/lib/server/agent";
import { checkToken } from "@/lib/server/eligibility";

type Body = { player?: string; nullifierHash?: string; token?: string; jobCommit?: string };

const SIGNATURE_TTL_SECONDS = 10 * 60;

/** The Seer binds itself to a seed for this sealed job and authorises the player to start the game. */
export async function POST(request: Request) {
  const { player, nullifierHash, token, jobCommit } = (await request.json()) as Body;
  if (!player || !isAddress(player)) return Response.json({ error: "invalid player" }, { status: 400 });
  if (!nullifierHash || !isHex(nullifierHash, { strict: true }) || nullifierHash.length !== 66) {
    return Response.json({ error: "invalid nullifierHash" }, { status: 400 });
  }
  if (!jobCommit || !isHex(jobCommit, { strict: true }) || jobCommit.length !== 66) {
    return Response.json({ error: "invalid jobCommit" }, { status: 400 });
  }
  if (!token || !checkToken(player as Address, nullifierHash as Hex, token)) {
    return Response.json({ error: "World ID verification expired, verify again" }, { status: 401 });
  }

  const seedCommit = commitSeed(deriveSeed(jobCommit as Hex, nullifierHash as Hex));
  const expiry = BigInt(Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS);
  const sig = await signStart({
    player: player as Address,
    jobCommit: jobCommit as Hex,
    seedCommit,
    nullifierHash: nullifierHash as Hex,
    expiry,
  });

  return Response.json({ seedCommit, expiry: expiry.toString(), sig });
}
