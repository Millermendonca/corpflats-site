/**
 * User provisioning script.
 *
 * Creates or updates user accounts with passwords read from environment variables.
 * Passwords are NEVER hardcoded — they must be supplied via env vars.
 *
 * Requires: ADMIN_PASSWORD, CRIS_PASSWORD, GRAZI_PASSWORD
 *
 * Usage (development):
 *   ADMIN_PASSWORD=... CRIS_PASSWORD=... GRAZI_PASSWORD=... pnpm --filter @workspace/db run seed
 *
 * This script is intentionally NOT invoked by post-merge.sh to prevent
 * known-credential accounts from being auto-created in production.
 * Run it manually once after initial deployment (or after rotating passwords).
 */
import { db, usersTable } from "./index";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function seed() {
  const { ADMIN_PASSWORD, CRIS_PASSWORD, GRAZI_PASSWORD } = process.env;

  if (!ADMIN_PASSWORD || !CRIS_PASSWORD || !GRAZI_PASSWORD) {
    console.error(
      "ERROR: Missing required environment variables.\n" +
      "Set ADMIN_PASSWORD, CRIS_PASSWORD, and GRAZI_PASSWORD before running this script.\n" +
      "Example: ADMIN_PASSWORD=yourpw CRIS_PASSWORD=pw2 GRAZI_PASSWORD=pw3 pnpm --filter @workspace/db run seed"
    );
    process.exit(1);
  }

  console.log("Provisioning users...");

  const SALT_ROUNDS = 10;

  const users = [
    { username: "admin", password: ADMIN_PASSWORD, role: "admin" },
    { username: "Cris",  password: CRIS_PASSWORD,  role: "camareira" },
    { username: "Grazi", password: GRAZI_PASSWORD, role: "camareira" },
  ];

  for (const u of users) {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, u.username));

    const hashed = await bcrypt.hash(u.password, SALT_ROUNDS);

    if (!existing) {
      await db.insert(usersTable).values({ username: u.username, password: hashed, role: u.role });
      console.log(`  Created user: ${u.username} (${u.role})`);
    } else {
      // Update password — allows safe password rotation via re-running this script.
      await db.update(usersTable).set({ password: hashed }).where(eq(usersTable.username, u.username));
      console.log(`  Updated password for: ${u.username}`);
    }
  }

  console.log("User provisioning complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("User provisioning failed:", err);
  process.exit(1);
});
