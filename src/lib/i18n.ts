import en from "@/messages/en.json";
import id from "@/messages/id.json";
import tl from "@/messages/tl.json";

export type Locale = "en" | "tl" | "id";
export type Messages = typeof en;

export const LOCALES: { code: Locale; nativeName: string; flag: string }[] = [
  { code: "en", nativeName: "English", flag: "🇬🇧" },
  { code: "tl", nativeName: "Tagalog", flag: "🇵🇭" },
  { code: "id", nativeName: "Bahasa Indonesia", flag: "🇮🇩" },
];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merges a partial translation over English, so a missing string falls back to English. */
export function withFallback(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = isObject(v) && isObject(base[k]) ? withFallback(base[k] as Record<string, unknown>, v) : v;
  }
  return out;
}

const catalogues: Record<Locale, Record<string, unknown>> = { en, tl, id };

export function messagesFor(locale: Locale): Messages {
  return withFallback(en, catalogues[locale] ?? {}) as Messages;
}
