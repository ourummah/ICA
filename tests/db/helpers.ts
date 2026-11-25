import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

import type { Database } from "@/lib/database.types";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (!ANON_KEY || !SERVICE_KEY) {
  throw new Error(
    "DB tests need NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (see .env.example).",
  );
}

export type Client = SupabaseClient<Database>;

export const admin: Client = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function anonClient(): Client {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

export async function sql<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export const TEST_PASSWORD = "test-password-123";
const runId = randomUUID().slice(0, 8);

/** Creates an auth user and returns its id. Emails are unique per test run. */
export async function createAuthUser(label: string): Promise<{ id: string; email: string }> {
  const email = `${label}-${runId}@rls.ica.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${label}: ${error?.message}`);
  return { id: data.user.id, email };
}

export async function signedInClient(email: string): Promise<Client> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return client;
}

export async function deleteTestAuthUsers(): Promise<void> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (u.email?.endsWith(`-${runId}@rls.ica.test`)) await admin.auth.admin.deleteUser(u.id);
  }
}

export interface SiteFixture {
  siteId: string;
  zoneId: string;
  equipmentId: string;
  chemicalId: string;
  ssopId: string;
  stepId: string;
  shiftId: string;
  taskId: string;
  stepRecordId: string;
  deviceId: string;
}

/** Inserts one row into every site-scoped table for a site (as postgres, so RLS is bypassed). */
export async function populateSite(
  siteId: string,
  cleanerProfileId: string,
  inspectorProfileId: string,
): Promise<SiteFixture> {
  const [zone] = await sql<{ id: string }>(
    `insert into zones (site_id, name) values ($1, 'Zone') returning id`,
    [siteId],
  );
  const [equipment] = await sql<{ id: string }>(
    `insert into equipment (site_id, zone_id, name) values ($1, $2, 'Machine') returning id`,
    [siteId, zone.id],
  );
  const [chemical] = await sql<{ id: string }>(
    `insert into chemicals (site_id, name, type) values ($1, 'Foam', 'alkaline') returning id`,
    [siteId],
  );
  const [ssop] = await sql<{ id: string }>(
    `insert into ssops (site_id, equipment_id, version) values ($1, $2, 1) returning id`,
    [siteId, equipment.id],
  );
  const [step] = await sql<{ id: string }>(
    `insert into ssop_steps (site_id, ssop_id, step_no, step_type, title_en, chemical_id, atp_required, atp_pass_max)
     values ($1, $2, 1, 'atp_check', 'Swab', $3, true, 150) returning id`,
    [siteId, ssop.id, chemical.id],
  );
  await sql(`update ssops set status = 'active' where id = $1`, [ssop.id]);
  const [shift] = await sql<{ id: string }>(
    `insert into shifts (site_id, shift_date, starts_at, ends_at)
     values ($1, current_date, now(), now() + interval '8 hours') returning id`,
    [siteId],
  );
  const [task] = await sql<{ id: string }>(
    `insert into tasks (site_id, shift_id, equipment_id, ssop_id, assigned_profile_id)
     values ($1, $2, $3, $4, $5) returning id`,
    [siteId, shift.id, equipment.id, ssop.id, cleanerProfileId],
  );
  const [device] = await sql<{ id: string }>(
    `insert into devices (site_id, label) values ($1, 'Spare tablet') returning id`,
    [siteId],
  );
  const [record] = await sql<{ id: string }>(
    `insert into step_records (site_id, task_id, ssop_step_id, profile_id, client_record_id, result, atp_value, payload_hash, note_original, note_language)
     values ($1, $2, $3, $4, gen_random_uuid(), 'done', 90, repeat('a', 64), 'Malinis na', 'tl') returning id`,
    [siteId, task.id, step.id, cleanerProfileId],
  );
  await sql(
    `insert into note_translations (site_id, step_record_id, text_en, source) values ($1, $2, 'Clean now', 'ai')`,
    [siteId, record.id],
  );
  await sql(
    `insert into photos (site_id, step_record_id, client_photo_id, storage_path, sha256)
     values ($1::uuid, $2, gen_random_uuid(), $1::text || '/photo.jpg', repeat('b', 64))`,
    [siteId, record.id],
  );
  await sql(
    `insert into exceptions (site_id, task_id, step_record_id, type, severity) values ($1, $2, $3, 'atp_fail', 'red')`,
    [siteId, task.id, record.id],
  );
  await sql(
    `insert into preop_inspections (site_id, zone_id, shift_id, inspector_profile_id, result) values ($1, $2, $3, $4, 'pass')`,
    [siteId, zone.id, shift.id, inspectorProfileId],
  );
  await sql(
    `insert into releases (site_id, zone_id, shift_id, qa_profile_id, decision) values ($1, $2, $3, $4, 'released')`,
    [siteId, zone.id, shift.id, inspectorProfileId],
  );
  return {
    siteId,
    zoneId: zone.id,
    equipmentId: equipment.id,
    chemicalId: chemical.id,
    ssopId: ssop.id,
    stepId: step.id,
    shiftId: shift.id,
    taskId: task.id,
    stepRecordId: record.id,
    deviceId: device.id,
  };
}

export async function createOrg(name: string, type: "processor" | "contractor"): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into organisations (name, type) values ($1, $2) returning id`,
    [name, type],
  );
  return row.id;
}

export async function createSite(orgId: string, name: string): Promise<string> {
  const [row] = await sql<{ id: string }>(`insert into sites (org_id, name) values ($1, $2) returning id`, [
    orgId,
    name,
  ]);
  return row.id;
}

export async function createProfile(name: string, authUserId: string | null = null): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into profiles (display_name, auth_user_id) values ($1, $2) returning id`,
    [name, authUserId],
  );
  return row.id;
}

export async function addMembership(
  profileId: string,
  orgId: string,
  siteId: string | null,
  role: Database["public"]["Enums"]["member_role"],
): Promise<void> {
  await sql(`insert into memberships (profile_id, org_id, site_id, role) values ($1, $2, $3, $4)`, [
    profileId,
    orgId,
    siteId,
    role,
  ]);
}

/** A staff member: auth user + profile + membership, returned with a signed-in client. */
export async function createStaff(
  label: string,
  orgId: string,
  siteId: string | null,
  role: Database["public"]["Enums"]["member_role"],
): Promise<{ profileId: string; client: Client }> {
  const user = await createAuthUser(label);
  const profileId = await createProfile(label, user.id);
  await addMembership(profileId, orgId, siteId, role);
  return { profileId, client: await signedInClient(user.email) };
}

/** A registered shared device for a site, returned with a signed-in client. */
export async function createDevice(
  label: string,
  siteId: string,
): Promise<{ deviceId: string; client: Client }> {
  const user = await createAuthUser(label);
  const [row] = await sql<{ id: string }>(
    `insert into devices (site_id, label, auth_user_id) values ($1, $2, $3) returning id`,
    [siteId, label, user.id],
  );
  return { deviceId: row.id, client: await signedInClient(user.email) };
}
