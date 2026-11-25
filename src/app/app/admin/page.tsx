import Link from "next/link";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { requireSiteAdmin } from "@/lib/admin/context";

import { DemoValuesNote } from "./demo-note";

async function Overview() {
  const { supabase, site, displayName } = await requireSiteAdmin();
  const count = async (table: "zones" | "equipment" | "chemicals" | "devices") =>
    (await supabase.from(table).select("id", { count: "exact", head: true }).eq("site_id", site.id)).count ??
    0;
  const [zones, equipment, chemicals, devices] = await Promise.all([
    count("zones"),
    count("equipment"),
    count("chemicals"),
    count("devices"),
  ]);
  const { count: activeSsops } = await supabase
    .from("ssops")
    .select("id", { count: "exact", head: true })
    .eq("site_id", site.id)
    .eq("status", "active");

  const tiles = [
    { label: "Zones", value: zones, href: "/app/admin/zones" },
    { label: "Equipment", value: equipment, href: "/app/admin/equipment" },
    { label: "Active SSOPs", value: activeSsops ?? 0, href: "/app/admin/equipment" },
    { label: "Chemicals", value: chemicals, href: "/app/admin/chemicals" },
    { label: "Devices", value: devices, href: "/app/admin/devices" },
  ];
  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-primary">{site.name}</h1>
        <p className="text-muted-foreground">Signed in as {displayName}</p>
      </div>
      <DemoValuesNote />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className="hover:border-accent">
              <p className="text-3xl font-bold text-primary">{t.value}</p>
              <p className="text-sm text-muted-foreground">{t.label}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function AdminHome() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Overview />
    </Suspense>
  );
}
