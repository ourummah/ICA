import { z } from "zod";

/**
 * Anchoring runs on Base Sepolia (testnet) only for now. Switching to Base mainnet is a deliberate
 * later step (docs/AUDIT_TRAIL.md) that needs a new contract, a funded wallet and Max's go-ahead.
 */
export const ANCHOR_CHAINS = {
  "base-sepolia": {
    id: 84532,
    name: "Base Sepolia",
    defaultRpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
  },
} as const;

export type AnchorChainName = keyof typeof ANCHOR_CHAINS;
export const DEFAULT_ANCHOR_CHAIN: AnchorChainName = "base-sepolia";

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const anchorEnvSchema = z.object({
  ANCHOR_PRIVATE_KEY: hex32,
  ANCHOR_CONTRACT_ADDRESS: address,
  ANCHOR_RPC_URL: z.url().optional(),
});

export interface AnchorConfig {
  chain: AnchorChainName;
  chainId: number;
  rpcUrl: string;
  explorer: string;
  privateKey: `0x${string}`;
  contractAddress: `0x${string}`;
}

/** Anchoring settings, or null when the wallet or contract isn't configured yet. */
export function anchorConfig(env: NodeJS.ProcessEnv = process.env): AnchorConfig | null {
  const parsed = anchorEnvSchema.safeParse({
    ANCHOR_PRIVATE_KEY: env.ANCHOR_PRIVATE_KEY || undefined,
    ANCHOR_CONTRACT_ADDRESS: env.ANCHOR_CONTRACT_ADDRESS || undefined,
    ANCHOR_RPC_URL: env.ANCHOR_RPC_URL || undefined,
  });
  if (!parsed.success) return null;
  const chain = ANCHOR_CHAINS[DEFAULT_ANCHOR_CHAIN];
  return {
    chain: DEFAULT_ANCHOR_CHAIN,
    chainId: chain.id,
    rpcUrl: parsed.data.ANCHOR_RPC_URL ?? chain.defaultRpc,
    explorer: chain.explorer,
    privateKey: parsed.data.ANCHOR_PRIVATE_KEY as `0x${string}`,
    contractAddress: parsed.data.ANCHOR_CONTRACT_ADDRESS as `0x${string}`,
  };
}

/** Block explorer link for a transaction on a known chain. */
export function explorerTxUrl(chain: string, txHash: string): string | null {
  const c = ANCHOR_CHAINS[chain as AnchorChainName];
  return c ? `${c.explorer}/tx/${txHash}` : null;
}

export function explorerAddressUrl(chain: string, addr: string): string | null {
  const c = ANCHOR_CHAINS[chain as AnchorChainName];
  return c ? `${c.explorer}/address/${addr}` : null;
}

/** Wallet balance below this (in ETH) raises an alert. */
export function minBalanceEth(env: NodeJS.ProcessEnv = process.env): number {
  const v = Number(env.ANCHOR_MIN_BALANCE_ETH);
  return Number.isFinite(v) && v > 0 ? v : 0.002;
}
