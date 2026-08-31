/**
 * Bootstrap script — runs automatically via post-merge.sh.
 * Only creates schema infrastructure (session table, sample flats, new feature tables).
 * Does NOT create or modify user accounts — use the separate provision-users
 * script for that, which requires explicit credentials via environment variables.
 *
 * Usage: pnpm --filter @workspace/db run bootstrap
 */
import { db, flatsTable } from "./index";
import { eq } from "drizzle-orm";
import pg from "pg";

async function bootstrap() {
  console.log("Bootstrapping database...");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  // ── Session table (connect-pg-simple) ────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE);
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
  console.log("  Session table ready");

  // ── Feature tables: periodic tasks ───────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS periodic_tasks (
      id serial PRIMARY KEY,
      name text NOT NULL,
      description text,
      period_days integer NOT NULL DEFAULT 7,
      is_active boolean NOT NULL DEFAULT true,
      created_by_user_id integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS periodic_task_flats (
      id serial PRIMARY KEY,
      periodic_task_id integer NOT NULL,
      flat_id integer NOT NULL,
      CONSTRAINT uniq_task_flat UNIQUE (periodic_task_id, flat_id)
    );

    CREATE TABLE IF NOT EXISTS periodic_task_executions (
      id serial PRIMARY KEY,
      periodic_task_id integer NOT NULL,
      flat_id integer NOT NULL,
      executed_by_user_id integer NOT NULL,
      executed_at timestamptz NOT NULL DEFAULT now(),
      notes text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("  Periodic-task tables ready");

  // ── Column additions: cleaning_requests ──────────────────────────────────────
  await pool.query(`
    ALTER TABLE cleaning_requests ADD COLUMN IF NOT EXISTS is_vacant BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  console.log("  cleaning_requests.is_vacant column ready");

  // ── Feature tables: flat observations ────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS flat_observations (
      id serial PRIMARY KEY,
      flat_id integer NOT NULL,
      author_user_id integer NOT NULL,
      category text NOT NULL DEFAULT 'outro',
      text text NOT NULL,
      status text NOT NULL DEFAULT 'aberta',
      resolved_at timestamptz,
      resolved_by_user_id integer,
      resolved_note text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("  Flat-observations table ready");

  // ── Feature tables: push tokens ───────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id serial PRIMARY KEY,
      user_id integer NOT NULL,
      token text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("  Push-tokens table ready");

  await pool.end();

  // ── Sample flats ─────────────────────────────────────────────────────────────
  const existingFlats = await db.select().from(flatsTable);
  if (existingFlats.length === 0) {
    const flatNumbers = ["101","102","103","104","105","106","201","202","203","204"];
    for (const number of flatNumbers) {
      await db.insert(flatsTable).values({ number, isOccupied: true });
      console.log(`  Created flat: ${number}`);
    }
  } else {
    console.log(`  Flats already exist (${existingFlats.length} flats)`);
  }

  console.log("Bootstrap complete.");
  process.exit(0);
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
