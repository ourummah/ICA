import { describe, expect, it } from "vitest";

import { staffSignInSchema } from "./schemas";

describe("staffSignInSchema", () => {
  it("accepts a valid sign-in", () => {
    const parsed = staffSignInSchema.parse({
      email: "qa@example.com",
      password: "long-enough",
      next: "/app",
    });
    expect(parsed.next).toBe("/app");
  });

  it("drops a redirect target outside the app, to prevent open redirects", () => {
    const parsed = staffSignInSchema.parse({
      email: "qa@example.com",
      password: "long-enough",
      next: "https://evil.example",
    });
    expect(parsed.next).toBeUndefined();
  });

  it("rejects a malformed email", () => {
    expect(staffSignInSchema.safeParse({ email: "nope", password: "long-enough" }).success).toBe(false);
  });
});
