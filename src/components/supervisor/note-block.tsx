import { Bot, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/card";
import type { ActionState } from "@/lib/admin/action-result";

import { NoteReviewForm } from "./note-review";

export interface NoteTranslation {
  text_en: string;
  source: "ai" | "human";
  created_at: string;
  profiles?: { display_name: string } | null;
}

const LANGUAGE = { tl: "Tagalog", id: "Bahasa Indonesia", en: "English" } as Record<string, string>;

/** Newest translation wins (rows are append-only). */
export function latestTranslation(rows: NoteTranslation[]): NoteTranslation | undefined {
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

/** A cleaner's note, original and English side by side, with the translation's label (SPEC F5/F8). */
export function NoteBlock({
  recordId,
  original,
  language,
  translations,
  canReview,
  action,
}: {
  recordId: string;
  original: string;
  language: string | null;
  translations: NoteTranslation[];
  canReview: boolean;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const latest = latestTranslation(translations);
  const needsEnglish = language && language !== "en";
  return (
    <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-2" data-note={recordId}>
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          Original{language ? ` · ${LANGUAGE[language] ?? language}` : ""}
        </p>
        <p className="mt-1">{original}</p>
      </div>
      {needsEnglish ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">English</p>
            {latest ? (
              latest.source === "ai" ? (
                <Badge tone="accent">
                  <Bot className="size-3.5" aria-hidden /> AI-translated
                </Badge>
              ) : (
                <Badge tone="green">
                  <UserCheck className="size-3.5" aria-hidden /> Supervisor-confirmed
                  {latest.profiles?.display_name ? ` (${latest.profiles.display_name})` : ""}
                </Badge>
              )
            ) : null}
          </div>
          {latest ? (
            <p className="text-sm" data-english>
              {latest.text_en}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Translation pending. It appears once it is ready.</p>
          )}
          {latest && canReview ? (
            <NoteReviewForm
              action={action}
              recordId={recordId}
              english={latest.text_en}
              label={`Review translation ${recordId}`}
            />
          ) : null}
          {latest?.source === "ai" ? (
            <p className="text-xs text-muted-foreground">
              AI translation for reference only. The original is the record.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
