import { isAddress, type Address } from "viem";
import { readReputation } from "@/lib/server/reputation";

/** GET ?players=0x…,0x… → ENS reputation for up to 12 players (for the booth's ledger). */
export async function GET(request: Request) {
  const players = (new URL(request.url).searchParams.get("players") ?? "")
    .split(",")
    .filter((p) => isAddress(p))
    .slice(0, 12) as Address[];
  const results = await Promise.all(players.map((p) => readReputation(p).then((r) => [p.toLowerCase(), r] as const).catch(() => null)));
  return Response.json(Object.fromEntries(results.filter((r) => r !== null)), { headers: { "cache-control": "public, max-age=15" } });
}
