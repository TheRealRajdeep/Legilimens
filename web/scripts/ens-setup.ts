// One-time (idempotent) ENSv2 setup for Legilimens on Sepolia.
//
//   node scripts/ens-setup.ts
//
// Creates, owned by ENS_OWNER_PRIVATE_KEY (the booth owner):
//   legilimens.eth                  the booth; aliased to the Seer's records
//   seer.legilimens.eth             the AI agent's namespace: its wallet, published config and ENSIP-26 agent records
//   players.legilimens.eth          a subregistry where every player gets <wallet-prefix>.players.legilimens.eth
// and delegates to the Seer (AGENT_PRIVATE_KEY) only:
//   - ROLE_REGISTRAR on the players subregistry (it can create player names, nothing else on the registry)
//   - text-record roles for PLAYER_KEYS on any name (per key, not whole names) and SEER_LIVE_KEYS on its own name
//
// Reads vault/subgraph from web/.env.local once, publishes them in ENS. The app then reads them from ENS.
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  getContractAddress,
  http,
  keccak256,
  namehash,
  parseEther,
  toHex,
  zeroAddress,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createPublicClient as createArcClient } from "viem";
import { vaultAbi } from "../lib/abi.ts";
import {
  ALL_ROLES,
  BOOTH_NAME,
  ENS_V2,
  PLAYERS_NAME,
  PLAYER_KEYS,
  ROLE_REGISTRAR,
  SEER_LIVE_KEYS,
  SEER_NAME,
  SEPOLIA_RPC,
  dnsEncode,
  erc20Abi,
  evmCoinType,
  factoryAbi,
  labelId,
  ownedResolverSalt,
  registrarAbi,
  registryAbi,
  resolverAbi,
  userRegistrySalt,
} from "../lib/ens.ts";

const ENV_PATH = new URL("../.env.local", import.meta.url);
const env = Object.fromEntries(
  readFileSync(ENV_PATH, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

function ensureOwnerKey(): Hex {
  if (env.ENS_OWNER_PRIVATE_KEY?.startsWith("0x") && env.ENS_OWNER_PRIVATE_KEY.length === 66) return env.ENS_OWNER_PRIVATE_KEY as Hex;
  const key = generatePrivateKey();
  const text = readFileSync(ENV_PATH, "utf8");
  writeFileSync(ENV_PATH, `${text.trimEnd()}\n\n# --- ENS (Sepolia, ENSv2 beta) ---\n# Booth owner of legilimens.eth. Delegates scoped roles to the Seer. Testnet only.\nENS_OWNER_PRIVATE_KEY=${key}\nNEXT_PUBLIC_SEER_ENS=${SEER_NAME}\n`);
  console.log("generated a new ENS owner key into web/.env.local");
  return key;
}

const owner = privateKeyToAccount(ensureOwnerKey());
const seer = privateKeyToAccount(env.AGENT_PRIVATE_KEY as Hex);
const transport = http(SEPOLIA_RPC);
const pub = createPublicClient({ chain: sepolia, transport });
const ownerWallet = createWalletClient({ chain: sepolia, transport, account: owner });
const seerWallet = createWalletClient({ chain: sepolia, transport, account: seer });

const step = (s: string) => console.log(`\n▸ ${s}`);
const done = (s: string) => console.log(`  ✓ ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(wallet: typeof ownerWallet, to: Hex, data: Hex, label: string, value = 0n) {
  const hash = await wallet.sendTransaction({ to, data, value });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  done(`${label} · https://sepolia.etherscan.io/tx/${hash}`);
  return receipt;
}

const hasCode = async (address: Hex) => {
  const code = await pub.getCode({ address });
  return !!code && code !== "0x";
};

/** Address a VerifiableFactory proxy will get, via simulation (the factory mixes the sender into CREATE2). */
async function predictProxy(implementation: Hex, salt: bigint, initData: Hex, from: Hex): Promise<Hex> {
  const { result } = await pub.simulateContract({
    address: ENS_V2.factory,
    abi: factoryAbi,
    functionName: "deployProxy",
    args: [implementation, salt, initData],
    account: from,
  });
  return result;
}

async function deployProxy(implementation: Hex, salt: bigint, initData: Hex, label: string): Promise<Hex> {
  const predicted = await predictProxy(implementation, salt, initData, owner.address).catch(() => null);
  if (predicted && (await hasCode(predicted))) {
    done(`${label} already deployed at ${predicted}`);
    return predicted;
  }
  const receipt = await send(
    ownerWallet,
    ENS_V2.factory,
    encodeFunctionData({ abi: factoryAbi, functionName: "deployProxy", args: [implementation, salt, initData] }),
    `deploy ${label}`,
  );
  const log = receipt.logs.find((l) => l.address.toLowerCase() === ENS_V2.factory.toLowerCase());
  const proxy = `0x${log!.topics[2]!.slice(26)}` as Hex;
  done(`${label} at ${proxy}`);
  return proxy;
}

async function main() {
  console.log(`owner ${owner.address}\nseer  ${seer.address}`);

  // --- config to publish, taken from the current deployment ---
  const vault = env.NEXT_PUBLIC_VAULT_ADDRESS as Hex;
  const deployBlock = env.NEXT_PUBLIC_VAULT_DEPLOY_BLOCK;
  const subgraph = env.SUBGRAPH_URL;
  if (!vault || !subgraph) throw new Error("NEXT_PUBLIC_VAULT_ADDRESS and SUBGRAPH_URL must be set in web/.env.local");
  const arc = createArcClient({ transport: http("https://rpc.testnet.arc.network") });
  const matrixHash = await arc.readContract({ address: vault, abi: vaultAbi, functionName: "MATRIX_HASH" });
  const stake = await arc.readContract({ address: vault, abi: vaultAbi, functionName: "stake" });

  step("fund the owner with Sepolia ETH");
  const ownerBal = await pub.getBalance({ address: owner.address });
  if (ownerBal < parseEther("0.03")) {
    await send(seerWallet, owner.address, "0x", "seer → owner 0.08 ETH", parseEther("0.08"));
  } else done(`owner has ${formatEther(ownerBal)} ETH`);

  step("owner's PermissionedResolver");
  const resolverInit = encodeFunctionData({ abi: resolverAbi, functionName: "initialize", args: [owner.address, ALL_ROLES, []] });
  const resolver = await deployProxy(ENS_V2.resolverImplementation, ownedResolverSalt(owner.address), resolverInit, "resolver");

  step(`${BOOTH_NAME} subregistry`);
  const registryInit = (root: Hex) => encodeFunctionData({ abi: registryAbi, functionName: "initialize", args: [root, ALL_ROLES] });
  const boothRegistry = await deployProxy(ENS_V2.registryImplementation, userRegistrySalt(BOOTH_NAME), registryInit(owner.address), `${BOOTH_NAME} registry`);

  step(`register ${BOOTH_NAME}`);
  const boothLabel = BOOTH_NAME.split(".")[0]!;
  const existingSub = await pub.readContract({ address: ENS_V2.rootRegistry, abi: registryAbi, functionName: "getSubregistry", args: [boothLabel] });
  if (existingSub !== zeroAddress) {
    if (existingSub.toLowerCase() !== boothRegistry.toLowerCase()) throw new Error(`${BOOTH_NAME} is registered with a different subregistry (${existingSub})`);
    done(`${BOOTH_NAME} already registered`);
  } else {
    if (!(await pub.readContract({ address: ENS_V2.registrar, abi: registrarAbi, functionName: "isAvailable", args: [boothLabel] }))) {
      throw new Error(`${BOOTH_NAME} is not available`);
    }
    const duration = 365n * 24n * 3600n;
    const [base, premium] = await pub.readContract({ address: ENS_V2.registrar, abi: registrarAbi, functionName: "getRegisterPrice", args: [boothLabel, duration, ENS_V2.paymentToken] });
    const price = base + premium;
    await send(ownerWallet, ENS_V2.paymentToken, encodeFunctionData({ abi: erc20Abi, functionName: "mint", args: [owner.address, price * 2n] }), "mint test USDC for registration");
    await send(ownerWallet, ENS_V2.paymentToken, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ENS_V2.registrar, price * 2n] }), "approve registrar");
    const secret = keccak256(toHex(`${owner.address}:${Date.now()}`));
    const referrer = `0x${"0".repeat(64)}` as Hex;
    const commitment = await pub.readContract({
      address: ENS_V2.registrar,
      abi: registrarAbi,
      functionName: "makeCommitment",
      args: [boothLabel, owner.address, secret, boothRegistry, resolver, duration, referrer],
    });
    await send(ownerWallet, ENS_V2.registrar, encodeFunctionData({ abi: registrarAbi, functionName: "commit", args: [commitment] }), "commit");
    console.log("  … waiting 70s for the commitment to mature");
    await sleep(70_000);
    await send(
      ownerWallet,
      ENS_V2.registrar,
      encodeFunctionData({ abi: registrarAbi, functionName: "register", args: [boothLabel, owner.address, secret, boothRegistry, resolver, duration, ENS_V2.paymentToken, referrer] }),
      `register ${BOOTH_NAME}`,
    );
  }

  step(`${PLAYERS_NAME} subregistry`);
  const playersRegistry = await deployProxy(ENS_V2.registryImplementation, userRegistrySalt(PLAYERS_NAME), registryInit(owner.address), `${PLAYERS_NAME} registry`);

  step("register seer and players labels");
  const expires = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);
  for (const [label, sub] of [["seer", zeroAddress], ["players", playersRegistry]] as const) {
    const state = await pub.readContract({ address: boothRegistry, abi: registryAbi, functionName: "getState", args: [labelId(label)] });
    if (state.status === 2) {
      done(`${label}.${BOOTH_NAME} already registered`);
      continue;
    }
    // Owner keeps full control of the label (ALL_ROLES); nothing is granted to the Seer here.
    await send(ownerWallet, boothRegistry, encodeFunctionData({ abi: registryAbi, functionName: "register", args: [label, owner.address, sub, resolver, ALL_ROLES, expires] }), `register ${label}.${BOOTH_NAME}`);
  }

  step("delegate to the Seer: create player names");
  if (await pub.readContract({ address: playersRegistry, abi: registryAbi, functionName: "hasRootRoles", args: [ROLE_REGISTRAR, seer.address] })) {
    done("Seer already holds ROLE_REGISTRAR on the players registry");
  } else {
    await send(ownerWallet, playersRegistry, encodeFunctionData({ abi: registryAbi, functionName: "grantRootRoles", args: [ROLE_REGISTRAR, seer.address] }), "grant ROLE_REGISTRAR (players registry) → Seer");
  }

  step("delegate to the Seer: write only its reputation keys");
  const grants = [
    ...PLAYER_KEYS.map((key) => ({ name: "", key })),
    ...SEER_LIVE_KEYS.map((key) => ({ name: SEER_NAME, key })),
  ];
  const grantCalls = grants.map(({ name, key }) =>
    encodeFunctionData({ abi: resolverAbi, functionName: "authorizeTextRoles", args: [dnsEncode(name), key, seer.address, true] }),
  );
  await send(ownerWallet, resolver, encodeFunctionData({ abi: resolverAbi, functionName: "multicall", args: [grantCalls] }), `grant ${grants.length} text-key roles → Seer`);

  step(`publish ${SEER_NAME} records`);
  const node = namehash(SEER_NAME);
  const agentContext = [
    `# The Seer`,
    `An autonomous fortune-teller agent. Players stake USDC on Arc and challenge it to name their occupation in ten questions.`,
    `- Plays on: Arc testnet (eip155:5042002), vault ${vault}`,
    `- Knowledge: 66-job x 24-trait matrix, keccak256 ${matrixHash} (verifiable on-chain as MATRIX_HASH)`,
    `- Learns from: The Graph subgraph ${subgraph}`,
    `- Earns a 5% rake when it names a trade, pays its own gas, and writes each player's reading to <wallet-prefix>.${PLAYERS_NAME}`,
    `- Delegated by ${BOOTH_NAME}'s owner: may create player names and write only legilimens.* reputation keys`,
    `- Verify any game: node web/scripts/replay.ts <gameId> in https://github.com/TheRealRajdeep/ethonline`,
  ].join("\n");
  const records: [string, string][] = [
    ["description", "The Seer of Legilimens: an AI fortune-teller that names your trade in ten questions."],
    ["url", "https://github.com/TheRealRajdeep/ethonline"],
    ["agent-context", agentContext],
    ["agent-endpoint[web]", env.PUBLIC_APP_URL || "https://github.com/TheRealRajdeep/ethonline"],
    ["legilimens.chain", "eip155:5042002"],
    ["legilimens.vault", vault],
    ["legilimens.vaultDeployBlock", deployBlock ?? "0"],
    ["legilimens.subgraph", subgraph],
    ["legilimens.matrixHash", matrixHash],
    ["legilimens.stake", stake.toString()],
    ["legilimens.players", PLAYERS_NAME],
  ];
  const recordCalls = [
    encodeFunctionData({ abi: resolverAbi, functionName: "setAddr", args: [node, seer.address] }),
    encodeFunctionData({ abi: resolverAbi, functionName: "setAddr", args: [node, evmCoinType(5042002), seer.address] }),
    ...records.map(([k, v]) => encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [node, k, v] })),
  ];
  await send(ownerWallet, resolver, encodeFunctionData({ abi: resolverAbi, functionName: "multicall", args: [recordCalls] }), `set ${records.length} text + 2 addr records`);

  step(`alias ${BOOTH_NAME} → ${SEER_NAME}`);
  try {
    await send(ownerWallet, resolver, encodeFunctionData({ abi: resolverAbi, functionName: "setAlias", args: [dnsEncode(BOOTH_NAME), dnsEncode(SEER_NAME)] }), "setAlias");
  } catch (err) {
    console.log(`  · alias skipped: ${(err as Error).message.split("\n")[0]}`);
  }

  step("verify: the Seer can write a player key, and cannot write anything else");
  const testNode = namehash(`test.${PLAYERS_NAME}`);
  const canWrite = await pub
    .simulateContract({ address: resolver, abi: resolverAbi, functionName: "setText", args: [testNode, "legilimens.readings", "0"], account: seer.address })
    .then(() => true, () => false);
  const canWriteOther = await pub
    .simulateContract({ address: resolver, abi: resolverAbi, functionName: "setText", args: [node, "legilimens.vault", "0xdead"], account: seer.address })
    .then(() => true, () => false);
  (canWrite ? done : console.log)(`${canWrite ? "" : "  ✗ "}Seer may write legilimens.readings on player names: ${canWrite}`);
  (!canWriteOther ? done : console.log)(`${!canWriteOther ? "" : "  ✗ "}Seer may NOT change its published vault record: ${!canWriteOther}`);

  console.log(`\nresolver ${resolver}\nbooth registry ${boothRegistry}\nplayers registry ${playersRegistry}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export { getContractAddress };
