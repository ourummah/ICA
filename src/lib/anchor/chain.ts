import "server-only";

import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  http,
  keccak256,
  parseEventLogs,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { AnchorConfig } from "./config";
import { ANCHOR_CONTRACT } from "./contract-artifact";

export interface Fees {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface AnchoredEvent {
  batchId: bigint;
  root: string;
  recordCount: bigint;
}

export interface AnchorReceipt {
  status: "success" | "reverted";
  blockNumber: bigint;
  blockTimestamp: Date;
  /** Anchored events this contract emitted in the transaction. */
  events: AnchoredEvent[];
}

/** What the anchoring service needs from a chain. The tests use a local Anvil node. */
export interface AnchorChain {
  readonly chain: string;
  readonly contractAddress: Hex;
  readonly walletAddress: Hex;
  getNonce(): Promise<number>;
  getFees(): Promise<Fees>;
  /** Signs, without sending, the anchor call. The hash is known before anything is broadcast. */
  signAnchor(args: {
    batchId: bigint;
    root: string;
    recordCount: number;
    nonce: number;
    fees: Fees;
  }): Promise<{
    hash: Hex;
    raw: Hex;
  }>;
  broadcast(raw: Hex): Promise<void>;
  getReceipt(hash: Hex): Promise<AnchorReceipt | null>;
  getBalance(): Promise<bigint>;
}

export const ANCHOR_GAS_LIMIT = 60_000n;

export function anchorCalldata(batchId: bigint, root: string, recordCount: number): Hex {
  return encodeFunctionData({
    abi: ANCHOR_CONTRACT.abi,
    functionName: "anchor",
    args: [batchId, `0x${root}`, BigInt(recordCount)],
  });
}

export function viemAnchorChain(cfg: {
  chain: string;
  chainId: number;
  rpcUrl: string;
  privateKey: Hex;
  contractAddress: Hex;
}): AnchorChain {
  const chain: Chain = defineChain({
    id: cfg.chainId,
    name: cfg.chain,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
  const client = createPublicClient({ chain, transport: http(cfg.rpcUrl, { timeout: 15_000 }) });
  const account = privateKeyToAccount(cfg.privateKey);
  const contractAddress = cfg.contractAddress;

  return {
    chain: cfg.chain,
    contractAddress,
    walletAddress: account.address,
    getNonce: () => client.getTransactionCount({ address: account.address, blockTag: "pending" }),
    async getFees() {
      const f = await client.estimateFeesPerGas();
      return { maxFeePerGas: f.maxFeePerGas, maxPriorityFeePerGas: f.maxPriorityFeePerGas };
    },
    async signAnchor({ batchId, root, recordCount, nonce, fees }) {
      const raw = await account.signTransaction({
        chainId: cfg.chainId,
        type: "eip1559",
        to: contractAddress,
        data: anchorCalldata(batchId, root, recordCount),
        value: 0n,
        nonce,
        gas: ANCHOR_GAS_LIMIT,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
      return { hash: keccak256(raw), raw };
    },
    async broadcast(raw) {
      await client.sendRawTransaction({ serializedTransaction: raw });
    },
    async getReceipt(hash) {
      const receipt = await client.getTransactionReceipt({ hash }).catch((e: unknown) => {
        if (e instanceof Error && /could not be found|not found/i.test(e.message)) return null;
        throw e;
      });
      if (!receipt) return null;
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      const events = parseEventLogs({
        abi: ANCHOR_CONTRACT.abi,
        eventName: "Anchored",
        logs: receipt.logs.filter((l) => l.address.toLowerCase() === contractAddress.toLowerCase()),
      }).map((l) => ({
        batchId: l.args.batchId,
        root: l.args.root.slice(2).toLowerCase(),
        recordCount: l.args.recordCount,
      }));
      return {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        blockTimestamp: new Date(Number(block.timestamp) * 1000),
        events,
      };
    },
    getBalance: () => client.getBalance({ address: account.address }),
  };
}

export function chainFromConfig(cfg: AnchorConfig): AnchorChain {
  return viemAnchorChain(cfg);
}

/** Reads an anchor transaction's receipt from a public RPC. No key needed. */
export function publicReceiptReader(cfg: { chainId: number; rpcUrl: string; contractAddress: Hex }) {
  return viemAnchorChain({
    chain: "reader",
    chainId: cfg.chainId,
    rpcUrl: cfg.rpcUrl,
    // Signing is never used by a reader; any valid key satisfies the account type.
    privateKey: `0x${"11".repeat(32)}`,
    contractAddress: cfg.contractAddress,
  }).getReceipt;
}
