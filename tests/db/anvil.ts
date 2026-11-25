import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";

import { createPublicClient, createWalletClient, http, defineChain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ANCHOR_CONTRACT } from "@/lib/anchor/contract-artifact";

const require = createRequire(import.meta.url);

/** Anvil's well-known, pre-funded development key (account 0). Never use it on a real network. */
export const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

/** Gives an address test ETH on the local node. */
export async function fund(rpcUrl: string, address: Hex): Promise<void> {
  await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "anvil_setBalance",
      params: [address, "0x56BC75E2D63100000"],
    }),
  });
}
export const ANVIL_CHAIN_ID = 31337;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

export interface Anvil {
  rpcUrl: string;
  stop(): void;
}

/** Starts a local Anvil node (from the @foundry-rs/anvil dev dependency). */
export async function startAnvil(): Promise<Anvil> {
  const port = await freePort();
  const bin = require.resolve("@foundry-rs/anvil/bin.mjs");
  const proc: ChildProcess = spawn(process.execPath, [bin, "--port", String(port), "--silent"], {
    stdio: "ignore",
  });
  const rpcUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return { rpcUrl, stop: () => proc.kill() };
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error("anvil did not start");
}

export function anvilChain(rpcUrl: string) {
  return defineChain({
    id: ANVIL_CHAIN_ID,
    name: "anvil",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

/** Deploys ICAAnchor from the given key and returns its address. */
export async function deployAnchor(rpcUrl: string, key: Hex = ANVIL_KEY): Promise<Hex> {
  const chain = anvilChain(rpcUrl);
  const wallet = createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(rpcUrl) });
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const hash = await wallet.deployContract({
    abi: ANCHOR_CONTRACT.abi,
    bytecode: ANCHOR_CONTRACT.bytecode as Hex,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error("deploy failed");
  return receipt.contractAddress;
}
