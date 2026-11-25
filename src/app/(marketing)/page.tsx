import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DemoForm } from "@/components/marketing/demo-form";

import { features, hero, pilot, pricing, problems, steps } from "./content";

export default function HomePage() {
  const showPricing = process.env.SHOW_PRICING === "true";
  return (
    <main className="flex flex-1 flex-col">
      <section className="bg-[#0f243e] text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-12 pb-16 md:pt-20 md:pb-24">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#3cc7c9]">{hero.eyebrow}</p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-5xl">{hero.title}</h1>
          <p className="max-w-2xl text-lg text-white/80">{hero.body}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" variant="accent">
              <a href="#demo">Book a demo</a>
            </Button>
            <Button asChild size="lg" variant="ghost" className="border-2 border-white/40 hover:bg-white/10">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="problem" className="mx-auto w-full max-w-6xl px-4 py-16">
        <h2 id="problem" className="text-3xl font-bold text-primary">
          The night shift is where food safety is won or lost
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {problems.map((p) => (
            <div key={p.title}>
              <h3 className="text-lg font-semibold">{p.title}</h3>
              <p className="mt-1 text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="how" className="scroll-mt-4 bg-muted">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <h2 id="how" className="text-3xl font-bold text-primary">
            How it works
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title}>
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <s.icon className="size-5" aria-hidden />
                    </span>
                    <span className="text-sm font-semibold text-muted-foreground">Step {i + 1}</span>
                  </div>
                  <h3 className="text-xl font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="features"
        aria-labelledby="features-title"
        className="mx-auto w-full max-w-6xl scroll-mt-4 px-4 py-16"
      >
        <h2 id="features-title" className="text-3xl font-bold text-primary">
          Made for washdown rooms, trusted by QA
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="flex gap-3">
              <f.icon className="mt-1 size-6 shrink-0 text-accent" aria-hidden />
              <div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="pilot" aria-labelledby="pilot-title" className="scroll-mt-4 bg-[#0f243e] text-white">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 md:grid-cols-2">
          <div>
            <h2 id="pilot-title" className="text-3xl font-bold">
              {pilot.title}
            </h2>
            <p className="mt-3 text-white/80">{pilot.body}</p>
            {showPricing ? (
              <div className="mt-6 rounded-lg border border-white/20 p-4" data-pricing>
                <h3 className="font-semibold">{pricing.title}</h3>
                <p className="mt-1 text-sm text-white/80">{pricing.body}</p>
              </div>
            ) : null}
          </div>
          <ul className="flex flex-col gap-3">
            {pilot.points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#3cc7c9]" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="demo"
        aria-labelledby="demo-title"
        className="mx-auto w-full max-w-3xl scroll-mt-4 px-4 py-16"
      >
        <h2 id="demo-title" className="text-3xl font-bold text-primary">
          Book a demo
        </h2>
        <p className="mt-2 text-muted-foreground">
          See a full night in 20 minutes: a cleaner on a phone in airplane mode, the supervisor&apos;s board
          turning red then green, QA releasing the zone, and the audit pack.
        </p>
        <Card className="mt-6">
          <DemoForm />
        </Card>
        <p className="mt-6 text-sm text-muted-foreground">
          Already a customer?{" "}
          <Link href="/app" className="underline">
            Sign in to the app
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
