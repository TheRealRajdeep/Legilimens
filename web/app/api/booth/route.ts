import { getBooth } from "@/lib/server/booth";

/** Public booth config, resolved from the Seer's ENS name. */
export async function GET() {
  try {
    return Response.json(await getBooth(), { headers: { "cache-control": "public, max-age=30" } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "could not resolve the booth from ENS" }, { status: 502 });
  }
}
