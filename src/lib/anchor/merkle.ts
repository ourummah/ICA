import { createHash } from "node:crypto";

/**
 * Merkle tree over record hashes (docs/AUDIT_TRAIL.md, "Merkle rule"). The standalone verifier
 * (verifier/verify-ica.mjs) implements the same rule:
 *   * leaves are the 32-byte record hashes, sorted ascending;
 *   * a parent is sha256(min(a, b) || max(a, b)) over the raw bytes (sorted pairs);
 *   * an odd node at the end of a level is promoted unchanged;
 *   * a single leaf is its own root, with an empty proof.
 * A proof is the list of sibling hashes from the leaf up.
 */
function hashPair(a: string, b: string): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  return createHash("sha256")
    .update(Buffer.from(x + y, "hex"))
    .digest("hex");
}

export interface MerkleTree {
  root: string;
  leaves: string[];
  proofs: Map<string, string[]>;
}

export function buildMerkleTree(hashes: string[]): MerkleTree {
  if (!hashes.length) throw new Error("A Merkle tree needs at least one leaf");
  const leaves = [...new Set(hashes)].sort();
  if (leaves.length !== hashes.length) throw new Error("Duplicate leaves");
  const proofs = new Map(leaves.map((l) => [l, [] as string[]]));
  // members[i] = leaves under node i of the current level
  let level = leaves.map((l) => ({ hash: l, members: [l] }));
  while (level.length > 1) {
    const next: typeof level = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = level[i + 1];
      if (!b) {
        next.push(a);
        continue;
      }
      for (const m of a.members) proofs.get(m)!.push(b.hash);
      for (const m of b.members) proofs.get(m)!.push(a.hash);
      next.push({ hash: hashPair(a.hash, b.hash), members: [...a.members, ...b.members] });
    }
    level = next;
  }
  return { root: level[0].hash, leaves, proofs };
}

export function rootFromProof(leaf: string, proof: string[]): string {
  return proof.reduce((acc, sibling) => hashPair(acc, sibling), leaf);
}
