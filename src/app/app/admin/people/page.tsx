import { Suspense } from "react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { requireSiteAdmin } from "@/lib/admin/context";

import { addCleaner, addStaff, removeCleaner, setPin } from "../actions";

const languages = [
  { value: "en", label: "English" },
  { value: "tl", label: "Tagalog" },
  { value: "id", label: "Bahasa Indonesia" },
];
const roleLabels: Record<string, string> = {
  cleaner: "Cleaner",
  supervisor: "Supervisor",
  qa: "QA",
  site_admin: "Site admin",
  contractor_admin: "Contractor admin",
};

async function People() {
  const { supabase, site } = await requireSiteAdmin();
  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, profiles(id, display_name, preferred_language, auth_user_id)")
    .eq("site_id", site.id)
    .order("role");
  const cleaners = (memberships ?? []).filter((m) => m.role === "cleaner" && m.profiles);
  const staff = (memberships ?? []).filter((m) => m.role !== "cleaner" && m.profiles);

  return (
    <>
      <h1 className="text-2xl font-bold text-primary">People</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Cleaners</h2>
        <p className="text-sm text-muted-foreground">
          Cleaners sign in on a shared device by tapping their name and entering a 4-digit PIN.
        </p>
        <Card>
          <ActionForm
            action={addCleaner}
            resetOnSuccess
            className="flex flex-wrap items-end gap-3"
            aria-label="Add cleaner"
          >
            <Field label="Name" className="min-w-48 flex-1">
              <Input name="display_name" required />
            </Field>
            <Field label="Language">
              <Select name="preferred_language" defaultValue="en">
                {languages.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="PIN">
              <Input
                name="pin"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                required
                className="w-24"
                autoComplete="off"
              />
            </Field>
            <Button type="submit">Add cleaner</Button>
          </ActionForm>
        </Card>
        <ul className="flex flex-col gap-2">
          {cleaners.map(({ profiles: p }) => (
            <li key={p!.id}>
              <Card className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-medium">{p!.display_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {languages.find((l) => l.value === p!.preferred_language)?.label}
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <ActionForm
                    action={setPin}
                    resetOnSuccess
                    className="flex items-end gap-2"
                    aria-label={`New PIN for ${p!.display_name}`}
                  >
                    <input type="hidden" name="profile_id" value={p!.id} />
                    <Field label="New PIN">
                      <Input
                        name="pin"
                        inputMode="numeric"
                        pattern="\d{4}"
                        maxLength={4}
                        required
                        className="w-24"
                        autoComplete="off"
                      />
                    </Field>
                    <Button type="submit" variant="outline">
                      Set PIN
                    </Button>
                  </ActionForm>
                  <ActionForm action={removeCleaner} inlineStatus>
                    <input type="hidden" name="profile_id" value={p!.id} />
                    <Button type="submit" variant="ghost" className="text-destructive">
                      Remove
                    </Button>
                  </ActionForm>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Staff</h2>
        <Card>
          <ActionForm
            action={addStaff}
            resetOnSuccess
            className="flex flex-wrap items-end gap-3"
            aria-label="Add staff member"
          >
            <Field label="Name" className="min-w-40 flex-1">
              <Input name="display_name" required />
            </Field>
            <Field label="Email" className="min-w-48 flex-1">
              <Input name="email" type="email" required autoComplete="off" />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue="supervisor">
                <option value="supervisor">Supervisor</option>
                <option value="qa">QA</option>
                <option value="site_admin">Site admin</option>
              </Select>
            </Field>
            <Field label="Temporary password" hint="Share it with them privately.">
              <Input name="password" type="text" minLength={10} required autoComplete="off" />
            </Field>
            <Button type="submit">Add staff</Button>
          </ActionForm>
        </Card>
        <ul className="flex flex-col gap-2">
          {staff.map((m, i) => (
            <li key={i}>
              <Card className="flex items-center justify-between">
                <span className="font-medium">{m.profiles!.display_name}</span>
                <Badge>{roleLabels[m.role]}</Badge>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default function PeoplePage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <People />
    </Suspense>
  );
}
