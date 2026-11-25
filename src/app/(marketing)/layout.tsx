import Link from "next/link";

import { Button } from "@/components/ui/button";

const nav = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#pilot", label: "Pilot" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-[#0f243e] text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="size-7" />
            <span>Intelligent Cleaning Audit</span>
          </Link>
          <nav aria-label="Site" className="flex flex-wrap items-center gap-1 text-sm">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="hidden rounded-md px-3 py-2 hover:bg-white/10 md:block"
              >
                {n.label}
              </a>
            ))}
            <Link href="/app" className="rounded-md px-3 py-2 hover:bg-white/10">
              Open the app
            </Link>
            <Button asChild variant="accent" size="sm">
              <Link href="/#demo">Book a demo</Link>
            </Button>
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Intelligent Cleaning Audit</p>
          <nav aria-label="Legal" className="flex gap-4">
            <Link href="/privacy" className="underline">
              Privacy
            </Link>
            <Link href="/app" className="underline">
              Staff sign-in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
