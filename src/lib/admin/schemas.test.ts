import { describe, expect, it } from "vitest";

import { chemicalSchema, cleanerSchema, staffSchema, zoneSchema } from "./schemas";

describe("admin schemas", () => {
  it("defaults zone sort order and trims names", () => {
    expect(zoneSchema.parse({ name: "  Boning Room ", risk_level: "high" })).toEqual({
      name: "Boning Room",
      risk_level: "high",
      sort_order: 0,
    });
  });

  it("turns empty optional chemical fields into null", () => {
    expect(
      chemicalSchema.parse({ name: "Foam", type: "alkaline", default_dilution: "", sds_url: "" }),
    ).toMatchObject({
      default_dilution: null,
      sds_url: null,
    });
  });

  it("requires a 4-digit cleaner PIN", () => {
    expect(cleanerSchema.safeParse({ display_name: "A", preferred_language: "tl", pin: "123" }).success).toBe(
      false,
    );
    expect(
      cleanerSchema.safeParse({ display_name: "A", preferred_language: "tl", pin: "1234" }).success,
    ).toBe(true);
  });

  it("does not let an admin create a contractor admin or cleaner as staff", () => {
    expect(
      staffSchema.safeParse({
        display_name: "A",
        email: "a@example.com",
        role: "contractor_admin",
        password: "long-password",
      }).success,
    ).toBe(false);
  });
});
