import { recordReading } from "@/lib/server/reputation";

// Two Sepolia transactions (name + records) need more than a default serverless timeout.
export const maxDuration = 60;

type Body = { gameId?: string };

/** Writes a settled game's reading to the player's ENS name. Anyone may trigger it; it only ever writes chain-verified results. */
export async function POST(request: Request) {
  try {
    const { gameId } = (await request.json()) as Body;
    if (!gameId || !/^\d+$/.test(gameId)) return Response.json({ error: "invalid gameId" }, { status: 400 });
    return Response.json(await recordReading(BigInt(gameId)));
  } catch (err) {
    console.error(err);
    return Response.json({ error: err instanceof Error ? err.message.split("\n")[0] : "could not write the reading" }, { status: 500 });
  }
}
