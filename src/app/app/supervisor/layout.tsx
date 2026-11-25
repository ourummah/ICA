import Link from "next/link";

const nav = [
  { href: "/app/supervisor", label: "Zone board" },
  { href: "/app/supervisor/exceptions", label: "Exceptions" },
];

export default function SupervisorLayout({ children }: LayoutProps<"/app/supervisor">) {
  return (
    <div className="flex flex-1 flex-col">
      <nav aria-label="Supervisor" className="bg-primary text-primary-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3">
          <Link href="/app" className="text-xs font-semibold uppercase tracking-wide text-accent">
            ICA · Supervisor
          </Link>
          <ul className="flex gap-1">
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="block rounded-md px-3 py-2 text-sm hover:bg-white/10">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  );
}
