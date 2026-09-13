// Shared ENSv2 (Sepolia beta) constants and helpers. Protocol addresses are ENS's canonical Sepolia deployment;
// everything about Legilimens itself (vault, subgraph, matrix hash) is published in ENS records, not here.
import { encodeAbiParameters, keccak256, labelhash, namehash, parseAbi, stringToBytes, toHex, type Hex } from "viem";

export const SEER_NAME = process.env.NEXT_PUBLIC_SEER_ENS ?? "seer.legilimens.eth";
export const BOOTH_NAME = SEER_NAME.split(".").slice(1).join("."); // legilimens.eth
export const PLAYERS_NAME = `players.${BOOTH_NAME}`;
export const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
export const ENS_APP = "https://sepolia.app.ens.domains";

export const ENS_V2 = {
  rootRegistry: "0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2",
  registrar: "0xa88553F454b77203B0D036A05c894d555EAAa2Cc",
  paymentToken: "0x768F42455A2D082E23ceeF7d51e5787C82d67a39",
  factory: "0x10dC6333CDFe1FCEf624c6e0a8221b91804Cd7ef",
  resolverImplementation: "0x9EAe5C2730a7dD16BDD1DeE6421a1B91e3B0365e",
  resolverProxyLogic: "0xA136BeE4E37B44586242e516a39893EfD54315e9",
  registryImplementation: "0x624a25d67B59D587752EbEc8DdeD8827dAe52050",
  universalResolver: "0x4a1817d13e9cf196f471725176355c1234b63c70",
} as const satisfies Record<string, Hex>;

// Registry roles (EnhancedAccessControl packs one role per nybble; admin roles live in the upper 128 bits).
export const ROLE_REGISTRAR = 1n << 0n;
export const ROLE_RENEW = 1n << 16n;
export const ALL_ROLES = BigInt("0x1111111111111111111111111111111111111111111111111111111111111111");

/** Text keys the Seer is delegated to write on every player name, and nothing else. */
export const PLAYER_KEYS = [
  "legilimens.readings",
  "legilimens.named",
  "legilimens.close",
  "legilimens.baffled",
  "legilimens.caughtLying",
  "legilimens.lastReading",
] as const;

/** Text keys the Seer maintains on its own name (the owner sets the rest). */
export const SEER_LIVE_KEYS = ["legilimens.readings", "legilimens.runway", "legilimens.record"] as const;

/** The Seer refuses to seal new games for a player caught lying this many times. */
export const LIAR_LIMIT = 2;

/** ENSIP-11 coin type for an EVM chain: 0x80000000 | chainId. */
export const evmCoinType = (chainId: number) => BigInt((0x80000000 | chainId) >>> 0);

/** DNS wire-format encoding used by ENSv2 resolver permission functions. "" encodes the root. */
export function dnsEncode(name: string): Hex {
  const labels = name ? name.split(".") : [];
  const parts: number[] = [];
  for (const label of labels) {
    const bytes = stringToBytes(label);
    if (bytes.length > 255) throw new Error(`label too long: ${label}`);
    parts.push(bytes.length, ...bytes);
  }
  parts.push(0);
  return toHex(new Uint8Array(parts));
}

/** Deterministic player label from their wallet: 4f852304 for 0x4F852304… */
export const playerLabel = (address: string) => address.toLowerCase().replace(/^0x/, "").slice(0, 8);
export const playerName = (address: string) => `${playerLabel(address)}.${PLAYERS_NAME}`;
export const ensAppUrl = (name: string) => `${ENS_APP}/${name}`;

export function userRegistrySalt(name: string): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
        [keccak256(stringToBytes("UserRegistry")), namehash(name), 0n],
      ),
    ),
  );
}

export function ownedResolverSalt(owner: Hex): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [keccak256(stringToBytes("OwnedResolver")), owner, 0n],
      ),
    ),
  );
}

export const labelId = (label: string) => BigInt(labelhash(label));

export const registryAbi = parseAbi([
  "function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource))",
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expires) returns (uint256 tokenId)",
  "function setSubregistry(uint256 tokenId, address registry)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function hasRootRoles(uint256 rolesBitmap, address account) view returns (bool)",
  "function initialize(address rootAccount, uint256 roleBitmap)",
]);

export const registrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256 tokenId)",
]);

export const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
]);

export const resolverAbi = parseAbi([
  "function initialize(address admin, uint256 roleBitmap, bytes[] setters)",
  "function setText(bytes32 node, string key, string value)",
  "function text(bytes32 node, string key) view returns (string)",
  "function setAddr(bytes32 node, address addr)",
  "function setAddr(bytes32 node, uint256 coinType, bytes addressBytes)",
  "function authorizeTextRoles(bytes toName, string key, address account, bool grant) returns (bool)",
  "function setAlias(bytes fromName, bytes toName)",
  "function multicall(bytes[] data) returns (bytes[] results)",
]);

export const erc20Abi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export const universalResolverAbi = parseAbi([
  "function findResolver(bytes name) view returns ((address resolver, bytes32 node, uint256 offset))",
]);
