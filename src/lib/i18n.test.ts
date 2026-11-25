import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import id from "@/messages/id.json";
import tl from "@/messages/tl.json";

import { messagesFor, withFallback } from "./i18n";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("i18n", () => {
  it("falls back to English for missing strings", () => {
    expect(withFallback({ a: { b: "en", c: "en" } }, { a: { b: "tl" } })).toEqual({
      a: { b: "tl", c: "en" },
    });
    expect(messagesFor("tl").step.done).toBeTruthy();
  });

  it("has no keys in tl or id that English lacks", () => {
    const base = new Set(keys(en));
    for (const cat of [tl, id]) expect(keys(cat).filter((k) => !base.has(k))).toEqual([]);
  });
});
