import { describe, expect, it } from "vitest";

import { checkPinOffline, isPinCacheFresh, PIN_CACHE_MAX_AGE_MS } from "./pin";

// Produced by Postgres: select extensions.crypt('4821', extensions.gen_salt('bf', 8))
const PGCRYPTO_HASH = "$2a$08$t0Hys2kLxLfTAD5OfZ48/OSjzkwIJah8PfWTItPc.9jZOZHVZ2CP6";

describe("offline PIN check", () => {
  it("accepts the right PIN against a pgcrypto bcrypt hash", async () => {
    expect(await checkPinOffline("4821", PGCRYPTO_HASH)).toBe(true);
  });

  it("rejects a wrong PIN", async () => {
    expect(await checkPinOffline("4822", PGCRYPTO_HASH)).toBe(false);
  });

  it("only trusts hashes synced within the last day", () => {
    const now = Date.now();
    expect(isPinCacheFresh(now - 60_000, now)).toBe(true);
    expect(isPinCacheFresh(now - PIN_CACHE_MAX_AGE_MS - 1, now)).toBe(false);
  });
});
