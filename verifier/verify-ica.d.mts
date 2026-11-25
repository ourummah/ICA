// Types for tests that import the standalone verifier. The verifier itself is plain JavaScript.
export const ANCHORED_TOPIC: string;
export function jcs(value: unknown): string;
export function sha256(data: string | Uint8Array): string;
export function rootFromProof(leaf: string, proof: string[]): string;
export interface VerifierCheck {
  name: string;
  ok: boolean;
  detail: string;
}
export function verifyBundle(
  bundle: unknown,
  opts?: { rpcUrl?: string },
): Promise<{ result: "PASS" | "FAIL" | "PENDING"; checks: VerifierCheck[]; blockTimestamp: string | null }>;
