import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

interface SolcOutput {
  errors?: { severity: string; formattedMessage: string }[];
  contracts: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>>;
}

/** Settings used for the deployed contract. Basescan verification needs the same ones. */
export const SOLC_SETTINGS = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "cancun",
  outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
} as const;

export function compileAnchorContract() {
  const solc = require("solc") as { compile(input: string): string; version(): string };
  const source = readFileSync(path.resolve(import.meta.dirname, "../../contracts/ICAAnchor.sol"), "utf8");
  const input = {
    language: "Solidity",
    sources: { "ICAAnchor.sol": { content: source } },
    settings: SOLC_SETTINGS,
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input))) as SolcOutput;
  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  const c = output.contracts["ICAAnchor.sol"].ICAAnchor;
  return {
    contractName: "ICAAnchor",
    compiler: {
      version: solc.version(),
      optimizer: SOLC_SETTINGS.optimizer,
      evmVersion: SOLC_SETTINGS.evmVersion,
    },
    abi: c.abi,
    bytecode: `0x${c.evm.bytecode.object}`,
  };
}
