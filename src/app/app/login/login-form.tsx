"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { signIn, type SignInState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 rounded-md border-2 border-input bg-background px-3 text-base focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="h-11 rounded-md border-2 border-input bg-background px-3 text-base focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none"
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
