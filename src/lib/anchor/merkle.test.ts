// @vitest-environment node
import { describe, expect, it } from "vitest";

import { rootFromProof as standaloneRoot, sha256 } from "../../../verifier/verify-ica.mjs";

import { buildMerkleTree, rootFromProof } from "./merkle";

const leaves = (n: number) => Array.from({ length: n }, (_, i) => sha256(`record ${i}`));

describe("Merkle tree", () => {
  it.each([1, 2, 3, 4, 5, 7, 8, 9, 16, 17, 100])("every proof of a %i-leaf tree leads to the root", (n) => {
    const tree = buildMerkleTree(leaves(n));
    for (const l of tree.leaves) {
      expect(rootFromProof(l, tree.proofs.get(l)!)).toBe(tree.root);
      expect(standaloneRoot(l, tree.proofs.get(l)!)).toBe(tree.root);
    }
  });

  it("a single leaf is its own root with an empty proof", () => {
    const [l] = leaves(1);
    const tree = buildMerkleTree([l]);
    expect(tree.root).toBe(l);
    expect(tree.proofs.get(l)).toEqual([]);
  });

  it("uses sorted pairs and promotes the odd node unchanged", () => {
    const [a, b, c] = leaves(3).sort();
    const pair = (x: string, y: string) => sha256(Buffer.from([x, y].sort().join(""), "hex"));
    expect(buildMerkleTree([c, a, b]).root).toBe(pair(pair(a, b), c));
    expect(buildMerkleTree([c, a, b]).proofs.get(c)).toEqual([pair(a, b)]);
  });

  it("is the same whatever order the leaves arrive in", () => {
    const l = leaves(9);
    expect(buildMerkleTree([...l].reverse()).root).toBe(buildMerkleTree(l).root);
  });

  it("a changed record or a wrong proof misses the root", () => {
    const tree = buildMerkleTree(leaves(6));
    const [first, second] = tree.leaves;
    expect(rootFromProof(sha256("tampered"), tree.proofs.get(first)!)).not.toBe(tree.root);
    expect(rootFromProof(first, tree.proofs.get(second)!)).not.toBe(tree.root);
  });

  it("rejects empty and duplicate leaves", () => {
    expect(() => buildMerkleTree([])).toThrow();
    const [l] = leaves(1);
    expect(() => buildMerkleTree([l, l])).toThrow(/Duplicate/);
  });
});
