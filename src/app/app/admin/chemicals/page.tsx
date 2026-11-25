import { Suspense } from "react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { requireSiteAdmin } from "@/lib/admin/context";

import { deleteChemical, saveChemical } from "../actions";
import { DemoValuesNote } from "../demo-note";

const types = ["alkaline", "acid", "chlorinated", "sanitiser", "other"] as const;

function ChemicalFields({
  c,
}: {
  c?: { name: string; type: string; default_dilution: string | null; sds_url: string | null };
}) {
  return (
    <>
      <Field label="Name" className="min-w-40 flex-1">
        <Input name="name" defaultValue={c?.name} required />
      </Field>
      <Field label="Type">
        <Select name="type" defaultValue={c?.type ?? "alkaline"}>
          {types.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Default dilution">
        <Input name="default_dilution" defaultValue={c?.default_dilution ?? ""} className="w-32" />
      </Field>
      <Field label="SDS link">
        <Input
          name="sds_url"
          type="url"
          defaultValue={c?.sds_url ?? ""}
          placeholder="https://"
          className="w-48"
        />
      </Field>
    </>
  );
}

async function Chemicals() {
  const { supabase, site } = await requireSiteAdmin();
  const { data: chemicals } = await supabase
    .from("chemicals")
    .select("id, name, type, default_dilution, sds_url")
    .eq("site_id", site.id)
    .order("name");
  return (
    <>
      <h1 className="text-2xl font-bold text-primary">Chemicals</h1>
      <DemoValuesNote />
      <Card>
        <h2 className="mb-3 font-semibold">Add a chemical</h2>
        <ActionForm
          action={saveChemical}
          resetOnSuccess
          className="flex flex-wrap items-end gap-3"
          aria-label="Add chemical"
        >
          <ChemicalFields />
          <Button type="submit">Add chemical</Button>
        </ActionForm>
      </Card>
      <ul className="flex flex-col gap-2">
        {(chemicals ?? []).map((c) => (
          <li key={c.id}>
            <Card className="flex flex-wrap items-end gap-3">
              <ActionForm
                action={saveChemical}
                className="flex flex-1 flex-wrap items-end gap-3"
                aria-label={`Edit ${c.name}`}
              >
                <input type="hidden" name="id" value={c.id} />
                <ChemicalFields c={c} />
                <Button type="submit" variant="outline">
                  Save
                </Button>
              </ActionForm>
              <ActionForm action={deleteChemical} inlineStatus>
                <input type="hidden" name="id" value={c.id} />
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

export default function ChemicalsPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Chemicals />
    </Suspense>
  );
}
