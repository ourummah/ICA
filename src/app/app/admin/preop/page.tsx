import { Suspense } from "react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requireSiteAdmin } from "@/lib/admin/context";

import { addDefaultPreopItems, addPreopItem, deletePreopItem } from "../actions";

async function PreopItems() {
  const { supabase, site } = await requireSiteAdmin();
  const { data: items } = await supabase
    .from("preop_items")
    .select("id, label, sort_order")
    .eq("site_id", site.id)
    .order("sort_order")
    .order("label");

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-primary">Pre-op checklist</h1>
        <p className="text-muted-foreground">
          QA checks these items in each zone before production starts. Changes apply to the next inspection.
        </p>
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Add an item</h2>
        <ActionForm
          action={addPreopItem}
          resetOnSuccess
          className="flex flex-wrap items-end gap-3"
          aria-label="Add checklist item"
        >
          <Field label="Item" className="min-w-64 flex-1">
            <Input name="label" required maxLength={200} />
          </Field>
          <Field label="Order">
            <Input
              name="sort_order"
              type="number"
              min={0}
              defaultValue={(items?.length ?? 0) + 1}
              className="w-20"
            />
          </Field>
          <Button type="submit">Add item</Button>
        </ActionForm>
      </Card>
      {items?.length ? null : (
        <ActionForm action={addDefaultPreopItems} aria-label="Add default items">
          <Button type="submit" variant="outline">
            Add the default items
          </Button>
        </ActionForm>
      )}
      <ol className="flex flex-col gap-2">
        {(items ?? []).map((item) => (
          <li key={item.id}>
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <span>
                {item.sort_order}. {item.label}
              </span>
              <ActionForm action={deletePreopItem} inlineStatus aria-label={`Remove ${item.label}`}>
                <input type="hidden" name="id" value={item.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Remove
                </Button>
              </ActionForm>
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}

export default function PreopPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <PreopItems />
    </Suspense>
  );
}
