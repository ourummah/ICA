import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireSiteRole, siteToday } from "@/lib/admin/context";
import { currentShift } from "@/lib/supervisor/data";

const inputClass = "h-10 rounded-md border border-input bg-background px-3";

async function AuditForm() {
  const { supabase, site } = await requireSiteRole(["qa", "supervisor", "site_admin"]);
  const shift = await currentShift(supabase, site.id);
  const defaultDate = shift?.shiftDate ?? siteToday(site.timezone);
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name")
    .eq("site_id", site.id)
    .order("sort_order");

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-primary">Audit pack</h1>
        <p className="text-muted-foreground">
          A PDF to read or hand to an auditor, and a CSV of every step record. Both include the result of a
          fresh record-integrity check.
        </p>
      </div>
      <Card>
        <form
          className="flex flex-col gap-4"
          aria-label="Audit pack"
          method="get"
          action="/app/supervisor/audit/pdf"
        >
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">From shift date</span>
              <input type="date" name="from" defaultValue={defaultDate} required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">To shift date</span>
              <input type="date" name="to" defaultValue={defaultDate} required className={inputClass} />
            </label>
          </div>
          <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
            <legend className="mb-1 text-sm font-medium">Zones (none ticked = all zones)</legend>
            {(zones ?? []).map((z) => (
              <label key={z.id} className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" name="zones" value={z.id} />
                {z.name}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="accent">
              Download PDF
            </Button>
            <Button type="submit" variant="outline" formAction="/app/supervisor/audit/csv">
              Download CSV
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            A night&apos;s pack takes a few seconds. Times are in the site time zone ({site.timezone}) in the
            PDF and in UTC in the CSV.
          </p>
        </form>
      </Card>
    </>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <AuditForm />
    </Suspense>
  );
}
