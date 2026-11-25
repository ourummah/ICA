"use client";

import { useActionState, useEffect, useRef } from "react";

import type { ActionState } from "@/lib/admin/action-result";
import { cn } from "@/lib/utils";

/**
 * A form bound to a server action that returns ActionState. Shows the action's message or
 * validation errors under the form, and optionally clears the form after success.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  inlineStatus = false,
  "aria-label": ariaLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  inlineStatus?: boolean;
  "aria-label"?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} aria-label={ariaLabel} aria-busy={pending} className={cn(className)}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state.errors?.length ? (
        <ul
          role="alert"
          className={cn("text-sm font-medium text-destructive", inlineStatus ? "" : "basis-full")}
        >
          {state.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : state.message ? (
        <p role="status" className={cn("text-sm text-status-green", inlineStatus ? "" : "basis-full")}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
