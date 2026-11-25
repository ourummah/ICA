import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Placeholder landing page. The real marketing site is built in M9. */
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Intelligent Cleaning Audit</p>
      <h1 className="text-4xl font-bold text-primary">Proof that every clean was done right.</h1>
      <p className="text-lg text-muted-foreground">
        Guided sanitation for food plants, built for night shifts, gloves and no signal.
      </p>
      <div>
        <Button asChild size="lg" variant="accent">
          <Link href="/app">Open the app</Link>
        </Button>
      </div>
    </main>
  );
}
