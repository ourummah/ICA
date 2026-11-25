import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { getTranslator, TranslationUnavailable, type Translator } from "./translate";

const BATCH = 20;
const LOOKBACK_DAYS = 14;

export interface TranslateResult {
  translated: number;
  failed: number;
}

/**
 * Translates cleaners' non-English notes that have no English yet (SPEC F8). Runs after sync and
 * whenever a dashboard loads, so a failure is simply retried later and never blocks the record.
 * Results are new rows in note_translations (source 'ai'); the original note is never changed.
 */
export async function translatePendingNotes(
  siteId: string,
  opts: { recordIds?: string[]; translator?: Translator } = {},
): Promise<TranslateResult> {
  const admin = createAdminClient();
  let q = admin
    .from("step_records")
    .select("id, site_id, note_original, note_language, note_translations(id)")
    .eq("site_id", siteId)
    .not("note_original", "is", null)
    .not("note_language", "is", null)
    .neq("note_language", "en")
    .gte("server_received_at", new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString())
    .order("server_received_at", { ascending: false })
    .limit(200);
  if (opts.recordIds) q = q.in("id", opts.recordIds);
  const { data, error } = await q;
  if (error) throw error;

  const pending = (data ?? [])
    .filter((r) => r.note_translations.length === 0 && r.note_original?.trim())
    .slice(0, BATCH);
  if (!pending.length) return { translated: 0, failed: 0 };

  const translator = opts.translator ?? getTranslator();
  let translated = 0;
  let failed = 0;
  for (const r of pending) {
    try {
      const english = await translator.translate(r.note_original!, r.note_language!);
      const { error: insertError } = await admin
        .from("note_translations")
        .insert({ step_record_id: r.id, site_id: r.site_id, text_en: english, source: "ai" });
      if (insertError) throw insertError;
      translated++;
    } catch (e) {
      failed++;
      console.error("translation failed", r.id, e instanceof Error ? e.message : e);
    }
  }
  return { translated, failed };
}

/** Fire-and-forget wrapper for `after()`: logs, never throws. */
export async function translateInBackground(siteId: string, recordIds?: string[]) {
  try {
    await translatePendingNotes(siteId, { recordIds });
  } catch (e) {
    if (e instanceof TranslationUnavailable) return; // no key configured: notes stay untranslated
    console.error("translation sweep failed", e instanceof Error ? e.message : e);
  }
}
