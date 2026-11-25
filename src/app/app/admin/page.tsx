import Link from "next/link";
import { Suspense } from "react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requireSiteAdmin } from "@/lib/admin/context";

import { DemoValuesNote } from "./demo-note";
import { resetDemoTenant } from "./reset-demo";

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

  const { data: org } = await supabase.from("organisations").select("is_demo").eq("id", site.orgId).single();

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
      {org?.is_demo ? (
        <Card className="flex flex-col gap-3 border-status-red/40">
          <h2 className="font-semibold">Reset demo</h2>
          <p className="text-sm text-muted-foreground">
            Wipes every record in this demo plant and loads tonight&apos;s shift again, as if freshly seeded.
            Everyone is signed out, and phones need to be registered again. Takes about 10 seconds.
          </p>
          <ActionForm
            action={resetDemoTenant}
            aria-label="Reset demo"
            className="flex flex-wrap items-end gap-3"
          >
            <Field label="Type RESET to confirm">
              <Input name="confirm" autoComplete="off" className="w-40" required />
            </Field>
            <Button type="submit" variant="destructive">
              Reset demo
            </Button>
          </ActionForm>
        </Card>
      ) : null}
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
