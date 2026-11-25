import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export interface AdminContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  profileId: string;
  displayName: string;
  site: { id: string; name: string; timezone: string; orgId: string };
}

/**
 * Resolves the signed-in site admin and the site they manage. Redirects to sign-in or the app
 * home if the user isn't a site admin. Multi-site admins get their first site (site switcher later).
 */
export async function requireSiteAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/app/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/app");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("site_id, org_id")
    .eq("profile_id", profile.id)
    .eq("role", "site_admin");
  if (!memberships?.length) redirect("/app");

  const siteIds = memberships.map((m) => m.site_id).filter((id): id is string => !!id);
  const orgIds = memberships.filter((m) => !m.site_id).map((m) => m.org_id);
  let query = supabase.from("sites").select("id, name, timezone, org_id").order("name").limit(1);
  if (orgIds.length && siteIds.length)
    query = query.or(`id.in.(${siteIds.join(",")}),org_id.in.(${orgIds.join(",")})`);
  else if (orgIds.length) query = query.in("org_id", orgIds);
  else query = query.in("id", siteIds);
  const { data: sites } = await query;
  const site = sites?.[0];
  if (!site) redirect("/app");

  return {
    supabase,
    profileId: profile.id,
    displayName: profile.display_name,
    site: { id: site.id, name: site.name, timezone: site.timezone, orgId: site.org_id },
  };
}

/** Today's date (YYYY-MM-DD) in the site's time zone. */
export function siteToday(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatSiteTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}
