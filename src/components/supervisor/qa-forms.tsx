"use client";

import { useState } from "react";

import { ActionForm } from "@/components/action-form";
import { compressPhoto } from "@/components/cleaner/photo";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/admin/action-result";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

const inputClass = "h-10 w-full rounded-md border border-input bg-background px-3";

/** QA's Release / Hold decision for one zone this shift. */
export function ReleaseForm({
  action,
  zoneId,
  shiftId,
  openRed,
}: {
  action: Action;
  zoneId: string;
  shiftId: string;
  openRed: number;
}) {
  // Controlled, so a failed submit (React resets uncontrolled fields) keeps what QA typed.
  const [decision, setDecision] = useState<"released" | "held">("released");
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState("");
  const blocked = decision === "released" && openRed > 0;
  return (
    <ActionForm action={action} className="flex flex-col gap-3" aria-label="Release or hold zone">
      <input type="hidden" name="zoneId" value={zoneId} />
      <input type="hidden" name="shiftId" value={shiftId} />
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 text-sm font-medium">Decision</legend>
        {(
          [
            ["released", "Release"],
            ["held", "Hold"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input px-4 has-[:checked]:border-accent has-[:checked]:bg-accent/10"
          >
            <input
              type="radio"
              name="decision"
              value={value}
              checked={decision === value}
              onChange={() => setDecision(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {blocked ? (
        <div className="flex flex-col gap-2 rounded-md border border-status-red bg-status-red/10 p-3 text-sm">
          <p className="font-semibold text-status-red">
            Release is blocked: {openRed} red exception{openRed === 1 ? " is" : "s are"} open in this zone.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="override"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            Override and release anyway (needs a reason; it is logged and shown in the audit pack)
          </label>
        </div>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Reason {decision === "held" || blocked ? "(required)" : "(optional)"}
        </span>
        <input
          name="reason"
          maxLength={1000}
          className={inputClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <Button
        type="submit"
        variant={decision === "released" ? "accent" : "destructive"}
        className="self-start"
      >
        {decision === "released" ? "Release zone" : "Hold zone"}
      </Button>
    </ActionForm>
  );
}

/**
 * Replaces the chosen photo with a compressed JPEG (1600px, ~0.7) so the form stays well under
 * the server's upload limit. Keeps the original if compression isn't possible.
 */
async function shrinkPhoto(input: HTMLInputElement) {
  const file = input.files?.[0];
  if (!file || (file.type === "image/jpeg" && file.size < 1024 * 1024)) return;
  try {
    const blob = await compressPhoto(file);
    const dt = new DataTransfer();
    dt.items.add(new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
    input.files = dt.files;
  } catch {
    // Leave the original; the server rejects anything over 5 MB with a clear message.
  }
}

/** The pre-op checklist for one zone: pass/fail per item, note and photo for failures. */
export function PreopForm({
  action,
  zoneId,
  shiftId,
  items,
  tasks,
}: {
  action: Action;
  zoneId: string;
  shiftId: string;
  items: string[];
  tasks: { id: string; label: string }[];
}) {
  const [results, setResults] = useState<Record<number, "pass" | "fail">>({});
  const anyFail = Object.values(results).includes("fail");
  return (
    <ActionForm action={action} className="flex flex-col gap-4" aria-label="Pre-op inspection">
      <input type="hidden" name="zoneId" value={zoneId} />
      <input type="hidden" name="shiftId" value={shiftId} />
      <input type="hidden" name="count" value={items.length} />
      <ol className="flex flex-col gap-3">
        {items.map((label, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <input type="hidden" name={`item_${i}_label`} value={label} />
            <fieldset className="flex flex-wrap items-center gap-3">
              <legend className="mb-1 font-medium">{label}</legend>
              {(["pass", "fail"] as const).map((r) => (
                <label
                  key={r}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input px-4 has-[:checked]:border-accent has-[:checked]:bg-accent/10"
                >
                  <input
                    type="radio"
                    name={`item_${i}_result`}
                    value={r}
                    required
                    aria-label={`${label}: ${r === "pass" ? "Pass" : "Fail"}`}
                    checked={results[i] === r}
                    onChange={() => setResults((cur) => ({ ...cur, [i]: r }))}
                  />
                  {r === "pass" ? "Pass" : "Fail"}
                </label>
              ))}
            </fieldset>
            {results[i] === "fail" ? (
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
                  <span className="font-medium">What&apos;s wrong (required)</span>
                  <input name={`item_${i}_note`} required maxLength={500} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Photo</span>
                  <input
                    type="file"
                    name={`item_${i}_photo`}
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    aria-label={`Photo for ${label}`}
                    onChange={(e) => void shrinkPhoto(e.currentTarget)}
                  />
                </label>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {anyFail && tasks.length ? (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-status-red p-3">
          <legend className="font-medium">Send equipment back for re-clean</legend>
          {tasks.map((t) => (
            <label key={t.id} className="flex items-center gap-2">
              <input type="checkbox" name="reclean" value={t.id} />
              {t.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      <Button type="submit" variant="accent" className="self-start">
        Save inspection
      </Button>
    </ActionForm>
  );
}
