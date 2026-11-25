import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requireSiteAdmin } from "@/lib/admin/context";
import { getDevice } from "@/lib/device/server";

import { registerThisDevice } from "./actions";

async function Register() {
  if (await getDevice()) redirect("/app/cleaner");
  const { site } = await requireSiteAdmin();
  return (
    <Card className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-primary">Register this device</h1>
      <p className="text-muted-foreground">
        Turn this phone or tablet into a shared cleaner device for <strong>{site.name}</strong>. Cleaners will
        sign in on it with their PIN. You will be signed out of your admin account on this device.
      </p>
      <ActionForm action={registerThisDevice} className="flex flex-col gap-4" aria-label="Register device">
        <Field label="Device name">
          <Input
            name="label"
            placeholder="Boning Room phone"
            required
            maxLength={80}
            className="h-12 text-lg"
          />
        </Field>
        <Button type="submit" size="cleaner" variant="accent">
          Register device
        </Button>
      </ActionForm>
    </Card>
  );
}

export default function DevicePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Register />
      </Suspense>
    </main>
  );
}
