import { describe, expect, it } from "vitest";

import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit per window, then resets", () => {
    const key = `t-${Math.random()}`;
    expect([1, 2, 3].map(() => rateLimit(key, 3, 1000, 0))).toEqual([true, true, true]);
    expect(rateLimit(key, 3, 1000, 500)).toBe(false);
    expect(rateLimit(`${key}-other`, 3, 1000, 500)).toBe(true);
    expect(rateLimit(key, 3, 1000, 1000)).toBe(true);
  });
});
