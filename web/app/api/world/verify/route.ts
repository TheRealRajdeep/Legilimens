import { hashSignal } from "@worldcoin/idkit-core/hashing";
import type { IDKitResult } from "@worldcoin/idkit-core";
import { isAddress, keccak256, pad, type Address, type Hex } from "viem";
import { issueToken } from "@/lib/server/eligibility";

type Body = { player?: string; result?: IDKitResult };

/**
 * Verifies a World ID proof with the Developer Portal and exchanges it for a short-lived eligibility token.
 * The proof's signal must be the player's wallet address, so a proof can't be replayed by another wallet.
 * The daily play quota itself is enforced on-chain, keyed by the nullifier.
 */
export async function POST(request: Request) {
  const { player, result } = (await request.json()) as Body;
  if (!player || !isAddress(player)) return Response.json({ error: "invalid player address" }, { status: 400 });

  if (process.env.WORLD_DEV_BYPASS === "true") {
    const nullifierHash = keccak256(player.toLowerCase() as Hex);
    return Response.json({ nullifierHash, ...issueToken(player as Address, nullifierHash), bypass: true });
  }

  if (!result || result.responses?.length !== 1) return Response.json({ error: "missing World ID result" }, { status: 400 });
  const item = result.responses[0];
  if (!("nullifier" in item)) return Response.json({ error: "session proofs are not accepted" }, { status: 400 });

  if (item.signal_hash && item.signal_hash.toLowerCase() !== hashSignal(player.toLowerCase()).toLowerCase()) {
    return Response.json({ error: "proof was generated for a different wallet" }, { status: 403 });
  }

  const rpId = process.env.WORLD_RP_ID;
  if (!rpId) return Response.json({ error: "World ID is not configured" }, { status: 500 });

  const res = await fetch(`https://developer.world.org/api/v4/verify/${rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result),
    cache: "no-store",
  });
  const verdict = (await res.json().catch(() => ({}))) as { success?: boolean; code?: string; detail?: string };
  if (!res.ok || verdict.success === false) {
    return Response.json({ error: verdict.detail ?? verdict.code ?? "World ID verification failed" }, { status: 403 });
  }

  const nullifierHash = pad(item.nullifier as Hex, { size: 32 });
  return Response.json({ nullifierHash, ...issueToken(player as Address, nullifierHash) });
}
