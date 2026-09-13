import { createHmac, timingSafeEqual } from "node:crypto";
import type { Address, Hex } from "viem";

// A verified World ID proof is exchanged for a short-lived HMAC token, so the player can pick their job
// after verifying without re-running the proof. Stateless: nothing is stored server-side.

const TOKEN_TTL_SECONDS = 15 * 60;

function mac(payload: string): string {
  const secret = process.env.AGENT_SEED_SECRET;
  if (!secret) throw new Error("Missing env AGENT_SEED_SECRET");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function issueToken(player: Address, nullifierHash: Hex) {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${player.toLowerCase()}:${nullifierHash.toLowerCase()}:${expiresAt}`;
  return { token: `${expiresAt}.${mac(payload)}`, expiresAt };
}

export function checkToken(player: Address, nullifierHash: Hex, token: string): boolean {
  const [expiresAtRaw, signature] = token.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!signature || !Number.isFinite(expiresAt) || expiresAt < Date.now() / 1000) return false;
  const expected = Buffer.from(mac(`${player.toLowerCase()}:${nullifierHash.toLowerCase()}:${expiresAt}`));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
