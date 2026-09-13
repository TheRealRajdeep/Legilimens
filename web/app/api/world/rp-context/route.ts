import { signRequest } from "@worldcoin/idkit-core/signing";
import { WORLD_ACTION } from "@/lib/config";

/** IDKit v4 requires an rp_context signed by the relying party's backend before the widget can open. */
export async function GET() {
  const rpId = process.env.WORLD_RP_ID;
  const signingKeyHex = process.env.WORLD_RP_SIGNING_KEY;
  if (!rpId || !signingKeyHex) {
    return Response.json({ error: "World ID is not configured (WORLD_RP_ID / WORLD_RP_SIGNING_KEY)" }, { status: 500 });
  }

  const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex, action: WORLD_ACTION, ttl: 300 });
  return Response.json({ rp_id: rpId, nonce, created_at: createdAt, expires_at: expiresAt, signature: sig });
}
