import pg from "pg";

/** Direct database access for e2e assertions (local Supabase only). */
export const db = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});

export async function query<T extends pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(text, params)).rows;
}
