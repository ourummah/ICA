"use client";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/admin/action-result";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** Resolve-with-note form for one exception. */
export function ResolveForm({ action, exceptionId }: { action: Action; exceptionId: string }) {
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-2" aria-label="Resolve exception">
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">Resolution note</span>
        <input
          name="note"
          required
          maxLength={1000}
          className="h-10 rounded-md border border-input bg-background px-3"
          placeholder="What was done"
        />
      </label>
      <Button type="submit" variant="outline">
        Resolve
      </Button>
    </ActionForm>
  );
}

/** Request a re-clean of a task: creates a new task for the same equipment. */
export function RecleanForm({ action, taskId }: { action: Action; taskId: string }) {
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-2" aria-label="Request re-clean">
      <input type="hidden" name="taskId" value={taskId} />
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">Reason for re-clean</span>
        <input
          name="note"
          required
          maxLength={1000}
          className="h-10 rounded-md border border-input bg-background px-3"
          placeholder="e.g. ATP over limit"
        />
      </label>
      <Button type="submit" variant="destructive">
        Request re-clean
      </Button>
    </ActionForm>
  );
}
