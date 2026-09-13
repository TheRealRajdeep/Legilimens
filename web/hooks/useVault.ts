"use client";

import { useBalance, useReadContracts } from "wagmi";
import { vaultAbi } from "@/lib/abi";
import { useBooth } from "@/components/booth/BoothConfig";

/** Live booth readouts: pot, stake, and the Seer's own ledger. Polls so settlements from other players show up. */
export function useVault() {
  const vault = { address: useBooth().vault, abi: vaultAbi } as const;
  const { data, refetch } = useReadContracts({
    contracts: [
      { ...vault, functionName: "pot" },
      { ...vault, functionName: "stake" },
      { ...vault, functionName: "agent" },
      { ...vault, functionName: "agentRevenue" },
      { ...vault, functionName: "agentOperatingCost" },
      { ...vault, functionName: "nextGameId" },
    ],
    query: { refetchInterval: 8_000 },
  });

  const [pot, stake, agent, agentRevenue, agentOperatingCost, nextGameId] = (data ?? []).map((r) => r.result);
  const { data: agentBalance, refetch: refetchAgent } = useBalance({
    address: agent as `0x${string}` | undefined,
    query: { enabled: Boolean(agent), refetchInterval: 8_000 },
  });

  const opCost = agentOperatingCost as bigint | undefined;
  const gamesPlayed = nextGameId ? Number(nextGameId as bigint) - 1 : 0;
  const costPerGame = opCost && gamesPlayed > 0 ? opCost / BigInt(gamesPlayed) : undefined;
  const runwayGames = agentBalance && costPerGame && costPerGame > 0n ? Number(agentBalance.value / costPerGame) : undefined;

  return {
    loaded: Boolean(data),
    pot: pot as bigint | undefined,
    stake: stake as bigint | undefined,
    agent: agent as `0x${string}` | undefined,
    agentRevenue: agentRevenue as bigint | undefined,
    agentOperatingCost: opCost,
    agentBalance: agentBalance?.value,
    gamesPlayed,
    runwayGames,
    refetch: () => {
      refetch();
      refetchAgent();
    },
  };
}
