import { createHash } from "node:crypto";

import canonicalize from "canonicalize";

/** RFC 8785 JSON Canonicalization Scheme: the exact text that gets hashed. */
export function jcs(value: unknown): string {
  const text = canonicalize(value);
  if (text === undefined) throw new Error("Value has no JSON representation");
  return text;
}

/** Lowercase hex SHA-256 of a string's UTF-8 bytes (or of raw bytes). */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export const HEX64 = /^[0-9a-f]{64}$/;
