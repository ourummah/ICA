"use client";

import { useState } from "react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/admin/action-result";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Supervisor review of a note's English (SPEC F5): confirm it as is, or correct it. Either way a
 * new 'human' translation row is saved; the cleaner's original and the AI version are kept.
 */
export function NoteReviewForm({
  action,
  recordId,
  english,
  label,
}: {
  action: Action;
  recordId: string;
  english: string;
  label: string;
}) {
  const [text, setText] = useState(english);
  const changed = text.trim() !== english.trim();
  return (
    <ActionForm action={action} className="flex flex-col gap-2" aria-label={label}>
      <input type="hidden" name="recordId" value={recordId} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">English</span>
        <textarea
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={2000}
          required
          className="rounded-md border border-input bg-background p-2"
        />
      </label>
      <Button type="submit" variant="outline" size="sm" className="self-start">
        {changed ? "Save correction" : "Confirm translation"}
      </Button>
    </ActionForm>
  );
}
