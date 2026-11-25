import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

import { signOut } from "./login/actions";

const roleLabels: Record<string, string> = {
  cleaner: "Cleaner",
  supervisor: "Supervisor",
  qa: "QA",
  site_admin: "Site admin",
  contractor_admin: "Contractor admin",
};

async function SignedInHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/app/login");
  if (user.app_metadata?.kind === "device") redirect("/app/cleaner");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: memberships } = profile
    ? await supabase
        .from("memberships")
        .select("role, organisations(name), sites(name)")
        .eq("profile_id", profile.id)
    : { data: [] };

  return (
    <>
      <h1 className="text-3xl font-bold text-primary">Welcome, {profile?.display_name ?? user.email}</h1>
      <ul className="flex flex-col gap-2">
        {(memberships ?? []).map((m, i) => (
          <li key={i} className="rounded-md border border-border px-4 py-3">
            <span className="font-semibold">{roleLabels[m.role] ?? m.role}</span>
            <span className="text-muted-foreground">
              {" "}
              · {m.organisations?.name}
              {m.sites ? ` · ${m.sites.name}` : " · all sites"}
            </span>
          </li>
        ))}
      </ul>
      {(memberships ?? []).some((m) => m.role === "site_admin") ? (
        <Button asChild size="lg" variant="accent" className="self-start">
          <Link href="/app/admin">Site setup</Link>
        </Button>
      ) : null}
      {(memberships ?? []).some((m) => m.role === "site_admin") ? (
        <Link href="/app/device" className="text-sm text-accent underline">
          Register this phone or tablet as a cleaner device
        </Link>
      ) : null}
      <p className="text-muted-foreground">Supervisor and QA dashboards arrive in later milestones.</p>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </>
  );
}

export default function AppHomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-16">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <SignedInHome />
      </Suspense>
    </main>
  );
}
