/**
 * Deploys the ICAAnchor contract to Base Sepolia from the anchor wallet.
 *   ANCHOR_PRIVATE_KEY=0x... node scripts/deploy-anchor-contract.ts
 * Normally run from GitHub Actions ("Deploy anchor contract"), so the key stays in repository
 * secrets. Refuses any network other than Base Sepolia: the mainnet switch is a separate step.
 */
import { createPublicClient, createWalletClient, formatEther, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { ANCHOR_CONTRACT } from "../src/lib/anchor/contract-artifact.ts";

const key = process.env.ANCHOR_PRIVATE_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("ANCHOR_PRIVATE_KEY must be set to the wallet's 0x-prefixed private key.");
  process.exit(1);
}
const rpcUrl = process.env.ANCHOR_RPC_URL || "https://sepolia.base.org";
const account = privateKeyToAccount(key as Hex);
const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });

const chainId = await client.getChainId();
if (chainId !== baseSepolia.id) {
  console.error(`The RPC is chain ${chainId}; this script only deploys to Base Sepolia (${baseSepolia.id}).`);
  process.exit(1);
}
const balance = await client.getBalance({ address: account.address });
console.log(`Wallet ${account.address} holds ${formatEther(balance)} ETH on Base Sepolia.`);
if (balance === 0n) {
  console.error("The wallet is empty. Get Base Sepolia ETH from a faucet first (see docs/DEPLOY.md).");
  process.exit(1);
}

const hash = await wallet.deployContract({
  abi: ANCHOR_CONTRACT.abi,
  bytecode: ANCHOR_CONTRACT.bytecode as Hex,
});
console.log(`Deploy transaction: https://sepolia.basescan.org/tx/${hash}`);
const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
if (receipt.status !== "success" || !receipt.contractAddress) {
  console.error("The deploy transaction failed.");
  process.exit(1);
}
console.log("");
console.log(`ICAAnchor deployed at ${receipt.contractAddress}`);
console.log(`  https://sepolia.basescan.org/address/${receipt.contractAddress}`);
console.log("");
console.log("Set ANCHOR_CONTRACT_ADDRESS to this address in Vercel.");
console.log(
  `To verify the source on Basescan: Solidity single file, compiler ${ANCHOR_CONTRACT.compiler.version}, ` +
    `optimizer on with ${ANCHOR_CONTRACT.compiler.optimizer.runs} runs, EVM ${ANCHOR_CONTRACT.compiler.evmVersion}, ` +
    "MIT licence, source contracts/ICAAnchor.sol.",
);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### ICAAnchor deployed\n\nAddress: \`${receipt.contractAddress}\` ([Basescan](https://sepolia.basescan.org/address/${receipt.contractAddress}))\n\nSet \`ANCHOR_CONTRACT_ADDRESS\` to this address in Vercel.\n`,
  );
}
