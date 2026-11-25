import { ArrowDown, ArrowUp, Camera, FlaskConical, Timer, TestTube } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { formatSiteTime, requireSiteAdmin } from "@/lib/admin/context";
import { STEP_TYPES, STEP_TYPE_VALUES } from "@/lib/ssop/step-types";

import { activateDraft, createDraft, deleteStep, importStepsCsv, moveStep, saveStep } from "../../actions";
import { DemoValuesNote } from "../../demo-note";

interface Step {
  id: string;
  step_no: number;
  step_type: (typeof STEP_TYPE_VALUES)[number];
  title_en: string;
  instructions_en: string;
  chemical_id: string | null;
  dilution: string | null;
  dwell_minutes: number | null;
  photo_required: boolean;
  atp_required: boolean;
  atp_pass_max: number | null;
}

function StepFields({ step, chemicals }: { step?: Step; chemicals: { id: string; name: string }[] }) {
  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-6">
      <Field label="Step type" className="sm:col-span-2">
        <Select name="step_type" defaultValue={step?.step_type ?? "pre_rinse"}>
          {STEP_TYPE_VALUES.map((t) => (
            <option key={t} value={t}>
              {STEP_TYPES[t].label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title" className="sm:col-span-4">
        <Input name="title_en" defaultValue={step?.title_en} required maxLength={80} />
      </Field>
      <Field label="Instructions" className="sm:col-span-6">
        <Textarea name="instructions_en" defaultValue={step?.instructions_en} maxLength={1000} />
      </Field>
      <Field label="Chemical" className="sm:col-span-2">
        <Select name="chemical_id" defaultValue={step?.chemical_id ?? ""}>
          <option value="">None</option>
          {chemicals.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Dilution">
        <Input name="dilution" defaultValue={step?.dilution ?? ""} />
      </Field>
      <Field label="Dwell (min)">
        <Input name="dwell_minutes" type="number" min={1} defaultValue={step?.dwell_minutes ?? ""} />
      </Field>
      <Field label="ATP pass ≤ (RLU)">
        <Input name="atp_pass_max" type="number" min={0} defaultValue={step?.atp_pass_max ?? ""} />
      </Field>
      <div className="flex flex-col justify-end gap-2">
        <Checkbox name="photo_required" label="Photo required" defaultChecked={step?.photo_required} />
        <Checkbox name="atp_required" label="ATP required" defaultChecked={step?.atp_required} />
      </div>
    </div>
  );
}

function StepSummary({ step, chemicalName }: { step: Step; chemicalName?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-semibold">
        {step.step_no}. {step.title_en}{" "}
        <span className="text-sm font-normal text-muted-foreground">
          · {STEP_TYPES[step.step_type].label}
        </span>
      </p>
      {step.instructions_en ? <p className="text-sm text-muted-foreground">{step.instructions_en}</p> : null}
      <p className="flex flex-wrap gap-2 text-xs">
        {chemicalName ? (
          <Badge>
            <FlaskConical className="size-3" aria-hidden /> {chemicalName}
            {step.dilution ? ` · ${step.dilution}` : ""}
          </Badge>
        ) : null}
        {step.dwell_minutes ? (
          <Badge>
            <Timer className="size-3" aria-hidden /> {step.dwell_minutes} min
          </Badge>
        ) : null}
        {step.photo_required ? (
          <Badge>
            <Camera className="size-3" aria-hidden /> Photo
          </Badge>
        ) : null}
        {step.atp_required ? (
          <Badge>
            <TestTube className="size-3" aria-hidden /> ATP ≤ {step.atp_pass_max}
          </Badge>
        ) : null}
      </p>
    </div>
  );
}

async function Builder({ params }: { params: PageProps<"/app/admin/equipment/[equipmentId]">["params"] }) {
  const { equipmentId } = await params;
  const { supabase, site } = await requireSiteAdmin();
  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, name, teardown_notes, zones(name)")
    .eq("id", equipmentId)
    .eq("site_id", site.id)
    .maybeSingle();
  if (!equipment) notFound();

  const [{ data: ssops }, { data: chemicals }] = await Promise.all([
    supabase
      .from("ssops")
      .select("id, version, status, approved_at, approver:profiles!ssops_approved_by_fkey(display_name)")
      .eq("equipment_id", equipmentId)
      .order("version", { ascending: false }),
    supabase.from("chemicals").select("id, name").eq("site_id", site.id).order("name"),
  ]);
  const draft = ssops?.find((s) => s.status === "draft");
  const active = ssops?.find((s) => s.status === "active");
  const shown = draft ?? active;
  const { data: steps } = shown
    ? await supabase
        .from("ssop_steps")
        .select(
          "id, step_no, step_type, title_en, instructions_en, chemical_id, dilution, dwell_minutes, photo_required, atp_required, atp_pass_max",
        )
        .eq("ssop_id", shown.id)
        .order("step_no")
    : { data: [] as Step[] };
  const chemicalName = (id: string | null) => chemicals?.find((c) => c.id === id)?.name;
  const hidden = (
    <>
      <input type="hidden" name="equipment_id" value={equipmentId} />
      {shown ? <input type="hidden" name="ssop_id" value={shown.id} /> : null}
    </>
  );

  return (
    <>
      <div>
        <Link href="/app/admin/equipment" className="text-sm text-muted-foreground underline">
          ← Equipment
        </Link>
        <h1 className="text-2xl font-bold text-primary">{equipment.name}</h1>
        <p className="text-muted-foreground">
          {equipment.zones?.name}
          {equipment.teardown_notes ? ` · Teardown: ${equipment.teardown_notes}` : ""}
        </p>
      </div>
      <DemoValuesNote />

      {draft ? (
        <Card className="flex flex-col gap-4 border-accent">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Draft v{draft.version} <Badge>Draft</Badge>
            </h2>
            <ActionForm action={activateDraft} inlineStatus className="flex items-center gap-3">
              {hidden}
              <Button type="submit" variant="accent" disabled={!steps?.length}>
                Activate v{draft.version}
              </Button>
            </ActionForm>
          </div>
          <p className="text-sm text-muted-foreground">
            Activating makes this version the one cleaners follow. It can&apos;t be edited afterwards; to
            change it, start a new draft.{" "}
            {active ? `v${active.version} will be retired and kept in history.` : ""}
          </p>

          <ol className="flex flex-col gap-3">
            {(steps ?? []).map((s, i) => (
              <li key={s.id}>
                <Card className="flex flex-col gap-3 bg-muted/40">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <StepSummary step={s} chemicalName={chemicalName(s.chemical_id)} />
                    <div className="flex gap-1">
                      <ActionForm action={moveStep} inlineStatus>
                        {hidden}
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="direction" value="up" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={i === 0}
                          aria-label={`Move step ${s.step_no} up`}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                      </ActionForm>
                      <ActionForm action={moveStep} inlineStatus>
                        {hidden}
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="direction" value="down" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={i === (steps?.length ?? 0) - 1}
                          aria-label={`Move step ${s.step_no} down`}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                      </ActionForm>
                      <ActionForm action={deleteStep} inlineStatus>
                        {hidden}
                        <input type="hidden" name="id" value={s.id} />
                        <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                          Delete
                        </Button>
                      </ActionForm>
                    </div>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-accent">
                      Edit step {s.step_no}
                    </summary>
                    <ActionForm action={saveStep} className="mt-3 flex flex-col items-start gap-3">
                      {hidden}
                      <input type="hidden" name="id" value={s.id} />
                      <StepFields step={s} chemicals={chemicals ?? []} />
                      <Button type="submit" variant="outline">
                        Save step
                      </Button>
                    </ActionForm>
                  </details>
                </Card>
              </li>
            ))}
          </ol>

          <Card>
            <h3 className="mb-3 font-semibold">Add step {(steps?.length ?? 0) + 1}</h3>
            <ActionForm
              action={saveStep}
              resetOnSuccess
              className="flex flex-col items-start gap-3"
              aria-label="Add step"
            >
              {hidden}
              <StepFields chemicals={chemicals ?? []} />
              <Button type="submit">Add step</Button>
            </ActionForm>
          </Card>

          <Card>
            <h3 className="mb-1 font-semibold">Import steps from CSV</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Replaces all steps in this draft. Chemicals are matched by name.{" "}
              <a href="/app/admin/ssop-template.csv" className="underline" download>
                Download the template
              </a>
              .
            </p>
            <ActionForm
              action={importStepsCsv}
              className="flex flex-wrap items-end gap-3"
              aria-label="Import steps from CSV"
            >
              {hidden}
              <Field label="CSV file">
                <Input name="file" type="file" accept=".csv,text/csv" required className="h-auto py-1.5" />
              </Field>
              <Button type="submit" variant="outline">
                Import
              </Button>
            </ActionForm>
          </Card>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {active ? (
                <>
                  SSOP v{active.version} <Badge tone="green">Active</Badge>
                </>
              ) : (
                "No SSOP yet"
              )}
            </h2>
            <ActionForm action={createDraft} inlineStatus>
              {hidden}
              <Button type="submit">
                {active ? `New draft (copy of v${active.version})` : "Start SSOP"}
              </Button>
            </ActionForm>
          </div>
          {active?.approved_at ? (
            <p className="text-sm text-muted-foreground">
              Activated {formatSiteTime(active.approved_at, site.timezone)}
              {active.approver?.display_name ? ` by ${active.approver.display_name}` : ""}
            </p>
          ) : null}
          <ol className="flex flex-col gap-2">
            {(steps ?? []).map((s) => (
              <li key={s.id} className="rounded-md border border-border p-3">
                <StepSummary step={s} chemicalName={chemicalName(s.chemical_id)} />
              </li>
            ))}
          </ol>
        </Card>
      )}

      {ssops && ssops.length > 0 ? (
        <section>
          <h2 className="mb-2 font-semibold">Version history</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {ssops.map((s) => (
              <li key={s.id}>
                v{s.version} · {s.status}
                {s.approved_at ? ` · activated ${formatSiteTime(s.approved_at, site.timezone)}` : ""}
                {s.approver?.display_name ? ` by ${s.approver.display_name}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export default function SsopBuilderPage({ params }: PageProps<"/app/admin/equipment/[equipmentId]">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Builder params={params} />
    </Suspense>
  );
}
