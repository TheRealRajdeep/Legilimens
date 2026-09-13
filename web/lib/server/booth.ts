import { getAddress, isAddress, zeroAddress, type Address, type Hex } from "viem";
import { vaultAbi } from "@/lib/abi";
import { BOOTH_NAME, ENS_V2, PLAYERS_NAME, SEER_NAME, dnsEncode, registryAbi, universalResolverAbi } from "@/lib/ens";
import { ensClient, publicClient } from "./clients";

/**
 * Everything the booth needs to run, read from the Seer's ENS name rather than baked into the build.
 * Point seer.legilimens.eth at a new vault and every deployment follows. Nothing here is hard-coded.
 */
export type Booth = {
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

const TTL_MS = 60_000;
let cached: { at: number; booth: Promise<Booth> } | undefined;

export function getBooth(): Promise<Booth> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.booth;
  const booth = load().catch((err) => {
    cached = undefined; // don't cache failures
    throw err;
  });
  cached = { at: Date.now(), booth };
  return booth;
}

async function text(key: string): Promise<string> {
  const value = await ensClient.getEnsText({ name: SEER_NAME, key, universalResolverAddress: ENS_V2.universalResolver });
  if (!value) throw new Error(`ENS record ${key} is missing on ${SEER_NAME}`);
  return value;
}

async function load(): Promise<Booth> {
  // Local development against anvil: set NEXT_PUBLIC_SEER_ENS= (empty) and use the env values instead.
  if (process.env.NEXT_PUBLIC_SEER_ENS === "") return fromEnv();

  const [vault, vaultDeployBlock, subgraph, matrixHash, chainId, seerAddress, found] = await Promise.all([
    text("legilimens.vault"),
    text("legilimens.vaultDeployBlock"),
    text("legilimens.subgraph"),
    text("legilimens.matrixHash"),
    text("legilimens.chain"),
    ensClient.getEnsAddress({ name: SEER_NAME, universalResolverAddress: ENS_V2.universalResolver }),
    ensClient.readContract({ address: ENS_V2.universalResolver, abi: universalResolverAbi, functionName: "findResolver", args: [dnsEncode(SEER_NAME)] }),
  ]);
  if (!isAddress(vault)) throw new Error(`ENS record legilimens.vault on ${SEER_NAME} is not an address`);
  if (!seerAddress) throw new Error(`${SEER_NAME} has no address record`);

  // The booth's published knowledge must be the knowledge the vault enforces.
  const onchainMatrix = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "MATRIX_HASH" });
  if (onchainMatrix.toLowerCase() !== matrixHash.toLowerCase()) {
    throw new Error(`ENS matrix hash ${matrixHash} does not match the vault's MATRIX_HASH ${onchainMatrix}`);
  }
  const agent = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "agent" });
  if (agent.toLowerCase() !== seerAddress.toLowerCase()) {
    throw new Error(`${SEER_NAME} resolves to ${seerAddress}, but the vault's agent is ${agent}`);
  }

  // Walk ENSv2 registries: .eth → legilimens.eth → players.legilimens.eth
  const boothRegistry = await ensClient.readContract({ address: ENS_V2.rootRegistry, abi: registryAbi, functionName: "getSubregistry", args: [BOOTH_NAME.split(".")[0]!] });
  const playersRegistry =
    boothRegistry === zeroAddress
      ? zeroAddress
      : await ensClient.readContract({ address: boothRegistry, abi: registryAbi, functionName: "getSubregistry", args: [PLAYERS_NAME.split(".")[0]!] });

  return {
    source: "ens",
    seerName: SEER_NAME,
    seerAddress: getAddress(seerAddress),
    vault: getAddress(vault),
    vaultDeployBlock,
    subgraph,
    matrixHash: matrixHash as Hex,
    chain: chainId,
    resolver: getAddress(found.resolver),
    playersName: PLAYERS_NAME,
    playersRegistry: getAddress(playersRegistry),
  };
}

function fromEnv(): Booth {
  const vault = process.env.NEXT_PUBLIC_VAULT_ADDRESS;
  if (!vault || !isAddress(vault)) throw new Error("Local mode: set NEXT_PUBLIC_VAULT_ADDRESS");
  return {
    source: "env",
    seerName: "",
    seerAddress: zeroAddress,
    vault: getAddress(vault),
    vaultDeployBlock: process.env.NEXT_PUBLIC_VAULT_DEPLOY_BLOCK ?? "0",
    subgraph: process.env.SUBGRAPH_URL ?? "",
    matrixHash: "0x",
    chain: "eip155:5042002",
    resolver: zeroAddress,
    playersName: "",
    playersRegistry: zeroAddress,
  };
}
