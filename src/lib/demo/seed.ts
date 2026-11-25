/**
 * Demo tenant: "Southern Cross Meats (Demo)". Every name, place and value here is fictional
 * (SPEC.md F10). Dilutions, dwell times and ATP limits are demo placeholders.
 *
 * This module only uses relative imports so `node scripts/seed.ts` can run it directly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../database.types.ts";

type Admin = SupabaseClient<Database>;
type StepType = Database["public"]["Enums"]["step_type"];
type Role = Database["public"]["Enums"]["member_role"];
type Language = Database["public"]["Enums"]["ui_language"];

export const DEMO_EMAIL_DOMAIN = "demo.ica.test";
export const DEMO_TIMEZONE = "Australia/Sydney";

export interface DemoStaff {
  key: "admin" | "supervisor" | "qa";
  name: string;
  email: string;
  role: Role;
}

export const demoStaff: DemoStaff[] = [
  { key: "admin", name: "Alex Morgan", email: `admin@${DEMO_EMAIL_DOMAIN}`, role: "site_admin" },
  { key: "supervisor", name: "Tom Nguyen", email: `supervisor@${DEMO_EMAIL_DOMAIN}`, role: "supervisor" },
  { key: "qa", name: "Jordan Smith", email: `qa@${DEMO_EMAIL_DOMAIN}`, role: "qa" },
];

export interface DemoCleaner {
  name: string;
  language: Language;
  pin: string;
}

export const demoCleaners: DemoCleaner[] = [
  { name: "Maria Santos", language: "tl", pin: "1111" },
  { name: "Budi Prasetyo", language: "id", pin: "2222" },
  { name: "Ramon Dela Cruz", language: "tl", pin: "3333" },
  { name: "Siti Rahma", language: "id", pin: "4444" },
];

const zones = [
  { key: "boning", name: "Boning Room", risk_level: "high", sort_order: 1 },
  { key: "slicing", name: "Slicing & Packing (RTE)", risk_level: "high", sort_order: 2 },
  { key: "mincing", name: "Mincing", risk_level: "medium", sort_order: 3 },
  { key: "chillers", name: "Chillers", risk_level: "low", sort_order: 4 },
] as const;
type ZoneKey = (typeof zones)[number]["key"];

const chemicals = [
  { key: "alkaline", name: "Alkaline foam", type: "alkaline", default_dilution: "Per label" },
  { key: "chlorinated", name: "Chlorinated foam", type: "chlorinated", default_dilution: "Per label" },
  { key: "acid", name: "Acid descaler", type: "acid", default_dilution: "Per label" },
  { key: "quat", name: "Quat sanitiser", type: "sanitiser", default_dilution: "Per label" },
  { key: "paa", name: "Peracetic acid", type: "sanitiser", default_dilution: "Per label" },
] as const;
type ChemicalKey = (typeof chemicals)[number]["key"];

interface StepSeed {
  type: StepType;
  title: string;
  instructions: string;
  chemical?: ChemicalKey;
  dilution?: string;
  dwell?: number;
  photo?: boolean;
  atpMax?: number;
}

/** SPEC.md section 9: the conveyor SSOP used in the demo script. */
const conveyorSteps: StepSeed[] = [
  {
    type: "prepare_isolate",
    title: "Isolate and lock out",
    instructions:
      "Stop, isolate and lock out the conveyor. Remove all product and packaging. Cover electrical boxes.",
    photo: true,
  },
  {
    type: "dry_clean",
    title: "Dry clean",
    instructions: "Scrape and remove all meat and fat scraps. Use a squeegee and scraper; no water yet.",
  },
  {
    type: "pre_rinse",
    title: "Pre-rinse",
    instructions: "Rinse top to bottom with warm water at low pressure.",
  },
  {
    type: "foam",
    title: "Apply foam",
    instructions: "Apply alkaline foam to all surfaces, bottom to top, including underside and frame.",
    chemical: "alkaline",
    dilution: "Per label",
    photo: true,
  },
  { type: "dwell", title: "Let foam work", instructions: "Leave foam on. Do not let it dry.", dwell: 15 },
  { type: "scrub", title: "Scrub", instructions: "Scrub belt edges, rollers and hard-to-reach areas." },
  {
    type: "rinse",
    title: "Rinse",
    instructions: "Rinse top to bottom until no foam remains. Don't spray onto clean areas.",
  },
  {
    type: "inspect",
    title: "Inspect",
    instructions: "Check with a torch: no residue, no fat film. If dirty, repeat from step 4.",
    photo: true,
  },
  {
    type: "sanitise",
    title: "Sanitise",
    instructions: "Apply sanitiser at the correct strength. Leave for contact time on label.",
    chemical: "quat",
    dilution: "Per label",
    dwell: 10,
  },
  {
    type: "atp_check",
    title: "ATP swab",
    instructions: "Swab belt surface and enter ATP reading.",
    atpMax: 150,
  },
];

function standardSteps(foam: ChemicalKey, sanitiser: ChemicalKey, withAtp: boolean): StepSeed[] {
  const steps: StepSeed[] = [
    {
      type: "prepare_isolate",
      title: "Isolate and strip down",
      instructions: "Isolate and lock out. Remove product, packaging and removable parts. Cover electrics.",
      photo: true,
    },
    {
      type: "dry_clean",
      title: "Dry clean",
      instructions: "Remove all scraps by hand or scraper. No water yet.",
    },
    {
      type: "pre_rinse",
      title: "Pre-rinse",
      instructions: "Rinse top to bottom with warm water at low pressure.",
    },
    {
      type: "foam",
      title: "Apply foam",
      instructions: "Foam all surfaces, bottom to top, including parts removed at strip-down.",
      chemical: foam,
      dilution: "Per label",
      photo: true,
    },
    { type: "dwell", title: "Let foam work", instructions: "Leave foam on. Do not let it dry.", dwell: 10 },
    { type: "rinse", title: "Rinse", instructions: "Rinse top to bottom until no foam remains." },
    {
      type: "inspect",
      title: "Inspect",
      instructions: "Check with a torch for residue and fat film. Re-clean any dirty area.",
      photo: true,
    },
    {
      type: "sanitise",
      title: "Sanitise",
      instructions: "Apply sanitiser at the correct strength and leave for the label contact time.",
      chemical: sanitiser,
      dilution: "Per label",
    },
  ];
  if (withAtp) {
    steps.push({
      type: "atp_check",
      title: "ATP swab",
      instructions: "Swab the food-contact surface and enter the reading.",
      atpMax: 150,
    });
  }
  return steps;
}

interface EquipmentSeed {
  key: string;
  zone: ZoneKey;
  name: string;
  teardown: string;
  steps: StepSeed[];
}

const equipment: EquipmentSeed[] = [
  {
    key: "conveyor",
    zone: "boning",
    name: "Conveyor belt — Boning Room Line 1",
    teardown: "Release belt tension, lift belt off rollers.",
    steps: conveyorSteps,
  },
  {
    key: "boning-table",
    zone: "boning",
    name: "Boning table 3",
    teardown: "Remove cutting boards and knife holders.",
    steps: standardSteps("alkaline", "quat", true),
  },
  {
    key: "slicer",
    zone: "slicing",
    name: "Slicer 2",
    teardown: "Remove blade guard, carriage and blade (cut-resistant gloves).",
    steps: standardSteps("chlorinated", "paa", true),
  },
  {
    key: "packer",
    zone: "slicing",
    name: "Thermoform packer",
    teardown: "Open forming and sealing stations, remove web guides.",
    steps: standardSteps("chlorinated", "paa", true),
  },
  {
    key: "mincer",
    zone: "mincing",
    name: "Mincer 1",
    teardown: "Remove hopper, worm, knife and plates.",
    steps: standardSteps("alkaline", "quat", true),
  },
  {
    key: "mixer",
    zone: "mincing",
    name: "Paddle mixer",
    teardown: "Lock out, lower bowl, remove paddles.",
    steps: standardSteps("alkaline", "quat", false),
  },
  {
    key: "chiller-floor",
    zone: "chillers",
    name: "Chiller 1 — floor and drains",
    teardown: "Lift drain covers and baskets.",
    steps: standardSteps("acid", "quat", false),
  },
  {
    key: "trolleys",
    zone: "chillers",
    name: "Hanging rail trolleys",
    teardown: "Unhook trolleys and bring to wash bay.",
    steps: standardSteps("alkaline", "quat", false),
  },
];

const stepIcons: Record<StepType, string> = {
  prepare_isolate: "lock",
  dry_clean: "brush",
  pre_rinse: "droplets",
  foam: "spray-can",
  dwell: "timer",
  scrub: "hand",
  rinse: "shower-head",
  inspect: "flashlight",
  sanitise: "shield-check",
  atp_check: "test-tube",
  reassemble: "wrench",
};

/** UTC instant for a wall-clock time in a time zone (no external date library). */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const asIfUtc = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(asIfUtc);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const zonedAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offsetMs = zonedAsUtc - asIfUtc.getTime();
  return new Date(asIfUtc.getTime() - offsetMs);
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function must<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`Seed failed at ${what}: ${result.error?.message ?? "no data returned"}`);
  }
  return result.data as NonNullable<T>;
}

async function removeDemoPhotos(admin: Admin): Promise<void> {
  const sites = must(
    await admin
      .from("sites")
      .select("id, organisations!sites_org_id_fkey!inner(is_demo)")
      .eq("organisations.is_demo", true),
    "listing demo sites",
  );
  for (const site of sites) {
    const paths: string[] = [];
    const walk = async (prefix: string) => {
      const { data } = await admin.storage.from("photos").list(prefix, { limit: 1000 });
      for (const item of data ?? []) {
        const path = `${prefix}/${item.name}`;
        if (item.id) paths.push(path);
        else await walk(path);
      }
    };
    await walk(site.id);
    for (let i = 0; i < paths.length; i += 100) {
      await admin.storage.from("photos").remove(paths.slice(i, i + 100));
    }
  }
}

async function deleteDemoAuthUsers(admin: Admin, extraIds: string[]): Promise<void> {
  const ids = new Set(extraIds);
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Listing auth users failed: ${error.message}`);
    for (const u of data.users) if (u.email?.endsWith(`@${DEMO_EMAIL_DOMAIN}`)) ids.add(u.id);
    if (data.users.length < 1000) break;
  }
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error && !/not found/i.test(error.message))
      throw new Error(`Deleting auth user failed: ${error.message}`);
  }
}

/** Removes every demo organisation, its records, files and auth users. */
export async function resetDemo(admin: Admin): Promise<void> {
  await removeDemoPhotos(admin);
  const authUsers = must(await admin.rpc("reset_demo_data"), "resetting demo data");
  await deleteDemoAuthUsers(
    admin,
    authUsers.map((r) => r.auth_user_id),
  );
}

export interface SeedResult {
  orgId: string;
  siteId: string;
  shiftId: string;
  taskCount: number;
}

/** Resets, then creates the demo tenant with tonight's shift and tasks. */
export async function seedDemo(
  admin: Admin,
  opts: { staffPassword: string; now?: Date },
): Promise<SeedResult> {
  const now = opts.now ?? new Date();
  await resetDemo(admin);

  const org = must(
    await admin
      .from("organisations")
      .insert({ name: "Southern Cross Meats (Demo)", type: "processor", is_demo: true })
      .select("id")
      .single(),
    "organisation",
  );
  const site = must(
    await admin
      .from("sites")
      .insert({
        org_id: org.id,
        name: "Riverbend Plant (Demo)",
        address: "1 Example Road, Riverbend (fictional)",
        timezone: DEMO_TIMEZONE,
      })
      .select("id")
      .single(),
    "site",
  );

  // Staff with email sign-in.
  const staffProfiles = {} as Record<DemoStaff["key"], string>;
  for (const s of demoStaff) {
    const { data, error } = await admin.auth.admin.createUser({
      email: s.email,
      password: opts.staffPassword,
      email_confirm: true,
      user_metadata: { display_name: s.name },
    });
    if (error || !data.user) throw new Error(`Seed failed creating ${s.email}: ${error?.message}`);
    const profile = must(
      await admin
        .from("profiles")
        .insert({ auth_user_id: data.user.id, display_name: s.name, preferred_language: "en" })
        .select("id")
        .single(),
      `profile ${s.name}`,
    );
    staffProfiles[s.key] = profile.id;
    must(
      await admin
        .from("memberships")
        .insert({ profile_id: profile.id, org_id: org.id, site_id: site.id, role: s.role })
        .select("id"),
      `membership ${s.name}`,
    );
  }

  // PIN-only cleaners.
  const cleanerIds: string[] = [];
  for (const c of demoCleaners) {
    const profile = must(
      await admin
        .from("profiles")
        .insert({ display_name: c.name, preferred_language: c.language })
        .select("id")
        .single(),
      `cleaner ${c.name}`,
    );
    cleanerIds.push(profile.id);
    must(
      await admin
        .from("memberships")
        .insert({ profile_id: profile.id, org_id: org.id, site_id: site.id, role: "cleaner" })
        .select("id"),
      `cleaner membership ${c.name}`,
    );
    const pin = await admin.rpc("set_cleaner_pin", { p_profile_id: profile.id, p_pin: c.pin });
    if (pin.error) throw new Error(`Seed failed setting PIN for ${c.name}: ${pin.error.message}`);
  }

  const zoneRows = must(
    await admin
      .from("zones")
      .insert(
        zones.map((z) => ({
          site_id: site.id,
          name: z.name,
          risk_level: z.risk_level,
          sort_order: z.sort_order,
        })),
      )
      .select("id, name"),
    "zones",
  );
  const zoneId = (key: ZoneKey) => {
    const name = zones.find((z) => z.key === key)!.name;
    return zoneRows.find((z) => z.name === name)!.id;
  };

  const chemicalRows = must(
    await admin
      .from("chemicals")
      .insert(
        chemicals.map((c) => ({
          site_id: site.id,
          name: c.name,
          type: c.type,
          default_dilution: c.default_dilution,
        })),
      )
      .select("id, name"),
    "chemicals",
  );
  const chemicalId = (key: ChemicalKey) => {
    const name = chemicals.find((c) => c.key === key)!.name;
    return chemicalRows.find((c) => c.name === name)!.id;
  };

  // Shift: tonight 22:00 to 06:00 site time.
  const today = localDate(now, DEMO_TIMEZONE);
  const startsAt = zonedTimeToUtc(today, "22:00", DEMO_TIMEZONE);
  const tomorrow = localDate(new Date(startsAt.getTime() + 12 * 3600 * 1000), DEMO_TIMEZONE);
  const endsAt = zonedTimeToUtc(tomorrow, "06:00", DEMO_TIMEZONE);
  const shift = must(
    await admin
      .from("shifts")
      .insert({
        site_id: site.id,
        shift_date: today,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .select("id")
      .single(),
    "shift",
  );

  let taskCount = 0;
  for (const [i, e] of equipment.entries()) {
    const eq = must(
      await admin
        .from("equipment")
        .insert({ site_id: site.id, zone_id: zoneId(e.zone), name: e.name, teardown_notes: e.teardown })
        .select("id")
        .single(),
      `equipment ${e.name}`,
    );
    const ssop = must(
      await admin
        .from("ssops")
        .insert({ site_id: site.id, equipment_id: eq.id, version: 1, status: "draft" })
        .select("id")
        .single(),
      `ssop ${e.name}`,
    );
    must(
      await admin
        .from("ssop_steps")
        .insert(
          e.steps.map((s, n) => ({
            ssop_id: ssop.id,
            site_id: site.id,
            step_no: n + 1,
            step_type: s.type,
            title_en: s.title,
            instructions_en: s.instructions,
            icon: stepIcons[s.type],
            chemical_id: s.chemical ? chemicalId(s.chemical) : null,
            dilution: s.dilution ?? null,
            dwell_minutes: s.dwell ?? null,
            photo_required: s.photo ?? false,
            atp_required: s.atpMax !== undefined,
            atp_pass_max: s.atpMax ?? null,
          })),
        )
        .select("id"),
      `steps ${e.name}`,
    );
    must(
      await admin
        .from("ssops")
        .update({ status: "active", approved_by: staffProfiles.admin, approved_at: now.toISOString() })
        .eq("id", ssop.id)
        .select("id"),
      `activate ssop ${e.name}`,
    );
    // The conveyor goes to the first cleaner (Tagalog speaker) for the demo script.
    must(
      await admin
        .from("tasks")
        .insert({
          site_id: site.id,
          shift_id: shift.id,
          equipment_id: eq.id,
          ssop_id: ssop.id,
          assigned_profile_id: cleanerIds[i % cleanerIds.length],
        })
        .select("id"),
      `task ${e.name}`,
    );
    taskCount++;
  }

  return { orgId: org.id, siteId: site.id, shiftId: shift.id, taskCount };
}
