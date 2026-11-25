import { Suspense } from "react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { formatSiteTime, requireSiteAdmin, siteToday } from "@/lib/admin/context";

import { assignTask } from "../actions";

const statusTone = {
  pending: "neutral",
  in_progress: "amber",
  completed: "green",
  reclean_required: "red",
  verified: "green",
} as const;

async function Tasks() {
  const { supabase, site } = await requireSiteAdmin();
  const today = siteToday(site.timezone);
  const [{ data: shift }, { data: equipment }, { data: cleaners }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, starts_at, ends_at")
      .eq("site_id", site.id)
      .eq("shift_date", today)
      .order("starts_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("equipment")
      .select("id, name, zones(name, sort_order), ssops(status)")
      .eq("site_id", site.id)
      .order("name"),
    supabase
      .from("memberships")
      .select("profiles(id, display_name)")
      .eq("site_id", site.id)
      .eq("role", "cleaner"),
  ]);
  const { data: tasks } = shift
    ? await supabase
        .from("tasks")
        .select("id, equipment_id, assigned_profile_id, status")
        .eq("shift_id", shift.id)
    : { data: [] };
  const people = (cleaners ?? []).flatMap((c) => (c.profiles ? [c.profiles] : []));
  const sorted = [...(equipment ?? [])].sort(
    (a, b) => (a.zones?.sort_order ?? 0) - (b.zones?.sort_order ?? 0) || a.name.localeCompare(b.name),
  );

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-primary">Tonight&apos;s tasks</h1>
        <p className="text-muted-foreground">
          {shift
            ? `Shift ${formatSiteTime(shift.starts_at, site.timezone)} – ${formatSiteTime(shift.ends_at, site.timezone)}`
            : "No shift yet for tonight. Assigning the first task creates it (22:00 to 06:00)."}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {sorted.map((e) => {
          const task = tasks?.find((t) => t.equipment_id === e.id && t.status !== "reclean_required");
          const hasActive = e.ssops.some((s) => s.status === "active");
          return (
            <li key={e.id}>
              <Card className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-medium">{e.name}</p>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    {e.zones?.name}
                    {task ? (
                      <Badge tone={statusTone[task.status]}>{task.status.replace("_", " ")}</Badge>
                    ) : null}
                    {!hasActive ? <Badge tone="amber">No active SSOP</Badge> : null}
                  </p>
                </div>
                <ActionForm
                  action={assignTask}
                  className="flex flex-wrap items-end gap-2"
                  aria-label={`Assign ${e.name}`}
                >
                  <input type="hidden" name="equipment_id" value={e.id} />
                  <Field label="Cleaner">
                    <Select
                      name="assigned_profile_id"
                      defaultValue={task?.assigned_profile_id ?? ""}
                      disabled={!hasActive}
                    >
                      <option value="">Unassigned</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" variant={task ? "outline" : "default"} disabled={!hasActive}>
                    {task ? "Update" : "Add to tonight"}
                  </Button>
                </ActionForm>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Tasks />
    </Suspense>
  );
}
