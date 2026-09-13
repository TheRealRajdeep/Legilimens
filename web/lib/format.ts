import { formatUnits } from "viem";

/** Native USDC on Arc has 18 decimals. Show cents, or more precision for tiny agent costs. */
export function usdc(value: bigint | undefined, digits = 2): string {
  if (value === undefined) return "—";
  const n = Number(formatUnits(value, 18));
  if (n !== 0 && Math.abs(n) < 0.01) return n.toFixed(4);
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
