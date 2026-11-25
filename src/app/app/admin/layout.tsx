import Link from "next/link";

const nav = [
  { href: "/app/admin", label: "Overview" },
  { href: "/app/admin/zones", label: "Zones" },
  { href: "/app/admin/equipment", label: "Equipment & SSOPs" },
  { href: "/app/admin/chemicals", label: "Chemicals" },
  { href: "/app/admin/people", label: "People" },
  { href: "/app/admin/devices", label: "Devices" },
  { href: "/app/admin/tasks", label: "Tonight's tasks" },
];

export default function AdminLayout({ children }: LayoutProps<"/app/admin">) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <nav
        aria-label="Site setup"
        className="border-b border-border bg-primary text-primary-foreground md:w-56 md:border-r md:border-b-0"
      >
        <div className="px-4 py-4">
          <Link href="/app" className="text-xs font-semibold uppercase tracking-wide text-accent">
            ICA · Site admin
          </Link>
        </div>
        <ul className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {nav.map((n) => (
            <li key={n.href}>
              <Link
                href={n.href}
                className="block whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-white/10"
              >
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  );
}
