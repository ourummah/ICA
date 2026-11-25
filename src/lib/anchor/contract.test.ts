// @vitest-environment node
import { decodeFunctionData, keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";

import { compileAnchorContract } from "../../../scripts/lib/solc";
import { ANCHORED_TOPIC } from "../../../verifier/verify-ica.mjs";

import { anchorCalldata } from "./chain";
import { ANCHOR_CONTRACT } from "./contract-artifact";

describe("anchor contract", () => {
  it("the committed bytecode and ABI match a fresh compile of contracts/ICAAnchor.sol", () => {
    const fresh = compileAnchorContract();
    expect(fresh.bytecode).toBe(ANCHOR_CONTRACT.bytecode);
    expect(fresh.abi).toEqual(ANCHOR_CONTRACT.abi);
  }, 60_000);

  it("the standalone verifier's event topic is keccak256 of the event signature", () => {
    expect(ANCHORED_TOPIC).toBe(keccak256(toBytes("Anchored(uint256,bytes32,uint256)")));
  });

  it("an anchor transaction carries only the batch id, the root and the record count", () => {
    const root = "ab".repeat(32);
    const data = anchorCalldata(42n, root, 17);
    const decoded = decodeFunctionData({ abi: ANCHOR_CONTRACT.abi, data });
    expect(decoded.functionName).toBe("anchor");
    expect(decoded.args).toEqual([42n, `0x${root}`, 17n]);
    // 4-byte selector + three 32-byte words: no room for anything else.
    expect((data.length - 2) / 2).toBe(4 + 3 * 32);
  });
});
