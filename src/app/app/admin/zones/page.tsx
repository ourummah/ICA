import { Suspense } from "react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { requireSiteAdmin } from "@/lib/admin/context";

import { deleteZone, saveZone } from "../actions";

const risks = [
  { value: "high", label: "High risk" },
  { value: "medium", label: "Medium risk" },
  { value: "low", label: "Low risk" },
];

async function Zones() {
  const { supabase, site } = await requireSiteAdmin();
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, risk_level, sort_order")
    .eq("site_id", site.id)
    .order("sort_order")
    .order("name");

  return (
    <>
      <h1 className="text-2xl font-bold text-primary">Zones</h1>
      <Card>
        <h2 className="mb-3 font-semibold">Add a zone</h2>
        <ActionForm
          action={saveZone}
          resetOnSuccess
          className="flex flex-wrap items-end gap-3"
          aria-label="Add zone"
        >
          <Field label="Name" className="min-w-48 flex-1">
            <Input name="name" required />
          </Field>
          <Field label="Risk">
            <Select name="risk_level" defaultValue="medium">
              {risks.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Order">
            <Input
              name="sort_order"
              type="number"
              min={0}
              defaultValue={(zones?.length ?? 0) + 1}
              className="w-20"
            />
          </Field>
          <Button type="submit">Add zone</Button>
        </ActionForm>
      </Card>
      <ul className="flex flex-col gap-2">
        {(zones ?? []).map((z) => (
          <li key={z.id}>
            <Card className="flex flex-wrap items-end gap-3">
              <ActionForm
                action={saveZone}
                className="flex flex-1 flex-wrap items-end gap-3"
                aria-label={`Edit ${z.name}`}
              >
                <input type="hidden" name="id" value={z.id} />
                <Field label="Name" className="min-w-48 flex-1">
                  <Input name="name" defaultValue={z.name} required />
                </Field>
                <Field label="Risk">
                  <Select name="risk_level" defaultValue={z.risk_level}>
                    {risks.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Order">
                  <Input
                    name="sort_order"
                    type="number"
                    min={0}
                    defaultValue={z.sort_order}
                    className="w-20"
                  />
                </Field>
                <Button type="submit" variant="outline">
                  Save
                </Button>
              </ActionForm>
              <ActionForm action={deleteZone} inlineStatus>
                <input type="hidden" name="id" value={z.id} />
                <Button type="submit" variant="ghost" className="text-destructive">
                  Delete
                </Button>
              </ActionForm>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function ZonesPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Zones />
    </Suspense>
  );
}
