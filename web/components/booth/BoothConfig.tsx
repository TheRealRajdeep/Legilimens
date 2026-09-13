"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import type { Address, Hex } from "viem";

export type BoothConfig = {
  source: "ens" | "env";
  seerName: string;
  seerAddress: Address;
  vault: Address;
  vaultDeployBlock: string;
  subgraph: string;
  matrixHash: Hex;
  chain: string;
  resolver: Address;
  playersName: string;
  playersRegistry: Address;
};

const BoothContext = createContext<BoothConfig | null>(null);

export function useBooth(): BoothConfig {
  const booth = useContext(BoothContext);
  if (!booth) throw new Error("useBooth must be used inside BoothProvider");
  return booth;
}

/** Resolves the booth (vault, subgraph, the Seer's identity) from ENS before anything that needs it renders. */
export function BoothProvider({ children }: { children: ReactNode }) {
  const { data, error, refetch, isFetching } = useQuery({
    queryKey: ["booth"],
    queryFn: async () => {
      const res = await fetch("/api/booth");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The booth could not be found");
      return json as BoothConfig;
    },
    staleTime: 60_000,
    retry: 2,
  });

  if (data) return <BoothContext.Provider value={data}>{children}</BoothContext.Provider>;

  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-md space-y-4">
        <p className="brand text-(length:--text-title) text-parchment">{error ? "The booth is dark." : "Lighting the candles…"}</p>
        <p className="text-(length:--text-whisper) text-faded">
          {error ? (error as Error).message : "Reading the Seer's name on ENS to find its vault and its ledger."}
        </p>
        {error ? (
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="press rounded-[3px] border border-ember/60 px-5 py-2 text-ember hover:bg-ember/10"
          >
            Try again
          </button>
        ) : null}
      </div>
    </main>
  );
}
