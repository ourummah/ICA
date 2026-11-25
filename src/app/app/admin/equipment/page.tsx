import Link from "next/link";
import { Suspense } from "react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { requireSiteAdmin } from "@/lib/admin/context";

import { saveEquipment } from "../actions";

async function Equipment() {
  const { supabase, site } = await requireSiteAdmin();
  const [{ data: zones }, { data: equipment }] = await Promise.all([
    supabase.from("zones").select("id, name").eq("site_id", site.id).order("sort_order"),
    supabase
      .from("equipment")
      .select("id, name, zone_id, ssops(version, status)")
      .eq("site_id", site.id)
      .order("name"),
  ]);

  return (
    <>
      <h1 className="text-2xl font-bold text-primary">Equipment &amp; SSOPs</h1>
      <Card>
        <h2 className="mb-3 font-semibold">Add equipment</h2>
        {zones?.length ? (
          <ActionForm
            action={saveEquipment}
            className="flex flex-wrap items-end gap-3"
            aria-label="Add equipment"
          >
            <Field label="Name" className="min-w-56 flex-1">
              <Input name="name" required />
            </Field>
            <Field label="Zone">
              <Select name="zone_id" required>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Teardown notes" className="min-w-56 flex-1">
              <Input name="teardown_notes" />
            </Field>
            <Button type="submit">Add and build SSOP</Button>
          </ActionForm>
        ) : (
          <p className="text-muted-foreground">
            Add a{" "}
            <Link href="/app/admin/zones" className="underline">
              zone
            </Link>{" "}
            first.
          </p>
        )}
      </Card>
      {(zones ?? []).map((z) => {
        const items = (equipment ?? []).filter((e) => e.zone_id === z.id);
        return (
          <section key={z.id} className="flex flex-col gap-2">
            <h2 className="font-semibold">{z.name}</h2>
            {items.length === 0 ? <p className="text-sm text-muted-foreground">No equipment yet.</p> : null}
            <ul className="flex flex-col gap-2">
              {items.map((e) => {
                const active = e.ssops.find((s) => s.status === "active");
                const draft = e.ssops.find((s) => s.status === "draft");
                return (
                  <li key={e.id}>
                    <Link href={`/app/admin/equipment/${e.id}`}>
                      <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-accent">
                        <span className="font-medium">{e.name}</span>
                        <span className="flex gap-2">
                          {active ? (
                            <Badge tone="green">SSOP v{active.version} active</Badge>
                          ) : (
                            <Badge tone="amber">No active SSOP</Badge>
                          )}
                          {draft ? <Badge>Draft v{draft.version}</Badge> : null}
                        </span>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}

export default function EquipmentPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Equipment />
    </Suspense>
  );
}
