import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  tl: "Tagalog (Filipino)",
  id: "Bahasa Indonesia",
};

const translationSchema = z.object({
  english: z.string(),
});

export const TRANSLATE_SYSTEM = `You translate short notes written by cleaners in a meat processing plant into English for their supervisor.

Rules:
- Translate faithfully. Keep the cleaner's meaning, tone and level of detail.
- Keep chemical names, product names, equipment names, numbers, units, codes and times exactly as written.
- Add nothing: no explanations, advice, summaries or commentary.
- If part of the note is already English, keep that part as it is.
- If the note is empty or cannot be understood, return it unchanged.

Return JSON with one field, "english", holding the translation.`;

export interface Translator {
  translate(note: string, language: string): Promise<string>;
}

export class TranslationUnavailable extends Error {}

/**
 * The Claude-backed translator. Secrets stay on the server (CLAUDE.md): this module is
 * server-only and reads ANTHROPIC_API_KEY from the environment.
 */
export function claudeTranslator(): Translator {
  if (!process.env.ANTHROPIC_API_KEY) throw new TranslationUnavailable("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ timeout: 60_000, maxRetries: 2 });
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
  return {
    async translate(note, language) {
      const response = await client.beta.messages.parse({
        model,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(translationSchema) },
        system: TRANSLATE_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Language of the note: ${LANGUAGE_NAMES[language] ?? language}\n\n<note>\n${note}\n</note>`,
          },
        ],
      });
      if (response.stop_reason === "refusal") throw new Error("Translation was declined");
      const english = response.parsed_output?.english?.trim();
      if (!english) throw new Error(`No translation returned (stop reason ${response.stop_reason})`);
      return english;
    },
  };
}

/**
 * A stand-in used only by automated tests (AI_TRANSLATE_FAKE=true with no API key), so the
 * end-to-end tests run without network access or cost. Clearly marked in its output.
 */
export const fakeTranslator: Translator = {
  async translate(note, language) {
    return `[test translation from ${language}] ${note}`;
  },
};

export function getTranslator(): Translator {
  if (!process.env.ANTHROPIC_API_KEY && process.env.AI_TRANSLATE_FAKE === "true") return fakeTranslator;
  return claudeTranslator();
}
