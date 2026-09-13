"use client";

import { IDKitRequestWidget } from "@worldcoin/idkit";
import { deviceLegacy, proofOfHuman, selfieCheckLegacy, type IDKitResult, type RpContext } from "@worldcoin/idkit-core";
import { useMemo, useState } from "react";
import { WORLD_ACTION, WORLD_APP_ID, WORLD_ENVIRONMENT, WORLD_PRESET } from "@/lib/config";
import { api, type Eligibility } from "./api";
import { Seer } from "../props/Seer";
import { Button, ErrorNote, Whisper } from "./ui";

const DEV_BYPASS = process.env.NEXT_PUBLIC_WORLD_DEV_BYPASS === "true";

export function WorldGate({ player, onVerified }: { player: `0x${string}`; onVerified: (e: Eligibility) => void }) {
  const [open, setOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preset = useMemo(() => {
    const signal = player.toLowerCase();
    if (WORLD_PRESET === "deviceLegacy") return deviceLegacy({ signal });
    if (WORLD_PRESET === "proofOfHuman") return proofOfHuman({ signal });
    return selfieCheckLegacy({ signal });
  }, [player]);

  async function begin() {
    setError(null);
    setBusy(true);
    try {
      setRpContext(await api.rpContext());
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach World ID");
    } finally {
      setBusy(false);
    }
  }

  async function bypass() {
    setBusy(true);
    try {
      onVerified(await api.verify(player));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bypass failed");
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto grid max-w-4xl items-center gap-10 px-6 py-16 md:grid-cols-[auto_1fr]">
      <Seer mood="idle" size={200} className="rise mx-auto" />
      <div className="space-y-6">
        <h2 className="brand rise text-(length:--text-title) leading-[1.05] text-parchment" style={{ "--i": 1 } as React.CSSProperties}>
          One face, one fortune.
        </h2>
        <p className="rise max-w-prose text-(length:--text-lead) text-parchment/90" style={{ "--i": 2 } as React.CSSProperties}>
          The Seer only reads living humans. Show your face to World App, and it will know you are no bot sent to drain the pot.
        </p>
        <Whisper className="rise max-w-prose" >
          Selfie Check runs on your phone. No image leaves it, only a proof. Three games per human, per day.
        </Whisper>
        <div className="rise flex flex-wrap items-center gap-4" style={{ "--i": 3 } as React.CSSProperties}>
          <Button onClick={begin} disabled={busy}>
            {busy ? "Opening…" : "Prove you're human"}
          </Button>
          {DEV_BYPASS ? (
            <Button tone="ghost" onClick={bypass} disabled={busy}>
              Enter without World ID (dev)
            </Button>
          ) : null}
        </div>
        {error ? <ErrorNote message={error} onDismiss={() => setError(null)} /> : null}
      </div>

      {rpContext ? (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={WORLD_APP_ID}
          action={WORLD_ACTION}
          rp_context={rpContext}
          allow_legacy_proofs
          preset={preset}
          environment={WORLD_ENVIRONMENT}
          handleVerify={async (result: IDKitResult) => {
            // Throwing here makes the widget show a failure instead of success.
            const eligibility = await api.verify(player, result);
            onVerified(eligibility);
          }}
          onSuccess={() => setOpen(false)}
          onError={(code) => setError(`World ID: ${code}`)}
        />
      ) : null}
    </section>
  );
}
