import { Suspense } from "react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { formatSiteTime, requireSiteAdmin } from "@/lib/admin/context";

import { renameDevice, revokeDevice } from "../actions";

async function Devices() {
  const { supabase, site } = await requireSiteAdmin();
  const { data: devices } = await supabase
    .from("devices")
    .select("id, label, registered_at, last_seen_at, revoked_at")
    .eq("site_id", site.id)
    .order("registered_at", { ascending: false });

  return (
    <>
      <h1 className="text-2xl font-bold text-primary">Devices</h1>
      <p className="text-muted-foreground">
        Shared phones and tablets cleaners sign in on. To register a new one, sign in as a site admin on that
        device and open the cleaner app; registration arrives with the cleaner app.
      </p>
      {devices?.length ? null : <p className="text-sm text-muted-foreground">No devices registered yet.</p>}
      <ul className="flex flex-col gap-2">
        {(devices ?? []).map((d) => (
          <li key={d.id}>
            <Card className="flex flex-wrap items-end justify-between gap-3">
              <ActionForm
                action={renameDevice}
                className="flex flex-wrap items-end gap-2"
                aria-label={`Rename ${d.label}`}
              >
                <input type="hidden" name="id" value={d.id} />
                <Field label="Label">
                  <Input name="label" defaultValue={d.label} required className="w-56" />
                </Field>
                <Button type="submit" variant="outline">
                  Rename
                </Button>
              </ActionForm>
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span>Registered {formatSiteTime(d.registered_at, site.timezone)}</span>
                <span>
                  {d.last_seen_at
                    ? `Last seen ${formatSiteTime(d.last_seen_at, site.timezone)}`
                    : "Not seen yet"}
                </span>
              </div>
              {d.revoked_at ? (
                <Badge tone="red">Revoked</Badge>
              ) : (
                <ActionForm action={revokeDevice} inlineStatus>
                  <input type="hidden" name="id" value={d.id} />
                  <Button type="submit" variant="ghost" className="text-destructive">
                    Revoke
                  </Button>
                </ActionForm>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function DevicesPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Devices />
    </Suspense>
  );
}
