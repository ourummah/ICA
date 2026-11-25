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

  it("translates every English string into tl and id, keeping placeholders", () => {
    const flat = (o: Record<string, unknown>, p = ""): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "object" && v !== null
          ? flat(v as Record<string, unknown>, `${p}${k}.`)
          : [[`${p}${k}`, String(v)]],
      );
    const vars = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();
    const enMap = new Map(flat(en));
    for (const cat of [tl, id]) {
      const map = new Map(flat(cat));
      expect([...enMap.keys()].filter((k) => !map.get(k)?.trim())).toEqual([]);
      for (const [k, v] of enMap) expect([k, vars(map.get(k) ?? "")]).toEqual([k, vars(v)]);
    }
  });
});
