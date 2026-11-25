// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeTranslator, getTranslator, TRANSLATE_SYSTEM, TranslationUnavailable } from "./translate";

afterEach(() => vi.unstubAllEnvs());

describe("translator", () => {
  it("tells the model to translate faithfully and add nothing", () => {
    expect(TRANSLATE_SYSTEM).toMatch(/faithfully/);
    expect(TRANSLATE_SYSTEM).toMatch(/Add nothing/);
    expect(TRANSLATE_SYSTEM).toMatch(/exactly as written/);
  });

  it("uses the labelled stand-in only for tests with no key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_TRANSLATE_FAKE", "true");
    expect(getTranslator()).toBe(fakeTranslator);
    expect(await fakeTranslator.translate("Malinis na", "tl")).toBe("[test translation from tl] Malinis na");
  });

  it("reports translation as unavailable with no key and no stand-in", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_TRANSLATE_FAKE", "");
    expect(() => getTranslator()).toThrow(TranslationUnavailable);
  });

  it("prefers the real translator when a key is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubEnv("AI_TRANSLATE_FAKE", "true");
    expect(getTranslator()).not.toBe(fakeTranslator);
  });
});
