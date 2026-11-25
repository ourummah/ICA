"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string; fieldErrors?: Record<string, string> };

export function DemoForm() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        fieldErrors?: Record<string, string>;
      };
      if (res.ok) setState({ kind: "sent" });
      else
        setState({
          kind: "error",
          message: json.error ?? "Something went wrong. Please try again.",
          fieldErrors: json.fieldErrors,
        });
    } catch {
      setState({ kind: "error", message: "Could not send. Check your connection and try again." });
    }
  }

  if (state.kind === "sent")
    return (
      <div role="status" className="flex items-start gap-3 rounded-lg bg-status-green/10 p-4">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-green" aria-hidden />
        <div>
          <p className="font-semibold">Thanks, we&apos;ve got your request.</p>
          <p className="text-sm text-muted-foreground">
            We&apos;ll be in touch within two business days to find a time.
          </p>
        </div>
      </div>
    );

  const fe = state.kind === "error" ? (state.fieldErrors ?? {}) : {};
  const err = (k: string) =>
    fe[k] ? (
      <span className="text-xs font-normal text-status-red" id={`demo-${k}-error`}>
        {fe[k]}
      </span>
    ) : null;

  return (
    <form onSubmit={onSubmit} aria-label="Book a demo" className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" autoComplete="name" required maxLength={120} aria-invalid={!!fe.name} />
          {err("name")}
        </Field>
        <Field label="Company">
          <Input name="company" autoComplete="organization" maxLength={160} />
        </Field>
        <Field label="Work email">
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            aria-invalid={!!fe.email}
          />
          {err("email")}
        </Field>
        <Field label="Phone (optional)">
          <Input name="phone" type="tel" autoComplete="tel" maxLength={40} />
        </Field>
      </div>
      <Field label="What would you like to see? (optional)">
        <Textarea name="message" rows={4} maxLength={2000} />
      </Field>
      {/* Honeypot: hidden from people and screen readers; bots tend to fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.kind === "error" ? (
        <p role="alert" className="text-sm text-status-red">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" size="lg" disabled={state.kind === "sending"}>
          {state.kind === "sending" ? "Sending…" : "Book a demo"}
        </Button>
        <p className="text-xs text-muted-foreground">
          We only use your details to arrange the demo. See our{" "}
          <a href="/privacy" className="underline">
            privacy notice
          </a>
          .
        </p>
      </div>
    </form>
  );
}
