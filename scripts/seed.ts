/**
 * Seed (or reset + re-seed) the SYNTHETIC demonstration dataset.
 *   npm run db:seed      → seed an empty database
 *   npm run db:reset     → wipe everything (incl. audit log + local uploads) and re-seed
 * Demo passwords default to the values in README; set SEED_DEMO_PASSWORD to override.
 */
import "./load-env";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getClient, getDb, schema } from "../src/server/db";
import { resetDatabase } from "../src/server/demo/reset";
import { seedReference } from "../src/server/demo/reference";
import { seedScenarios, DEMO_PASSWORDS } from "../src/server/demo/scenarios";

async function main() {
  const reset = process.argv.includes("--reset");
  const db = getDb();
  await migrate(db, { migrationsFolder: "./drizzle" });

  const existing = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (existing.length > 0 && !reset) {
    console.log("Database already contains data. Use `npm run db:reset` to wipe and re-seed.");
    getClient().close();
    return;
  }
  if (reset) {
    console.log("Resetting database…");
    await resetDatabase();
    const dir = path.resolve(process.env.UPLOAD_DIR || "./storage/uploads");
    try {
      for (const f of await readdir(dir)) {
        if (/^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/.test(f)) await rm(path.join(dir, f));
      }
    } catch {
      /* no local uploads yet */
    }
  }

  const t0 = Date.now();
  await seedReference();
  console.log("Reference data (document types, categories, DEMO ruleset) created.");
  await seedScenarios({ password: process.env.SEED_DEMO_PASSWORD || undefined, log: (s) => console.log("  ✓", s) });
  console.log(`\nSynthetic demo data ready in ${((Date.now() - t0) / 1000).toFixed(1)}s.\n`);
  if (!process.env.SEED_DEMO_PASSWORD) {
    console.log("Demo logins (LOCAL DEMO ONLY — never use in production):");
    console.log(`  inst1@demo.smartvalidate.test     ${DEMO_PASSWORDS.INSTITUTION}`);
    console.log(`  officer1@demo.smartvalidate.test  ${DEMO_PASSWORDS.OFFICER}`);
    console.log(`  admin@demo.smartvalidate.test     ${DEMO_PASSWORDS.ADMIN}`);
  } else {
    console.log("All demo accounts use the password from SEED_DEMO_PASSWORD.");
  }
  getClient().close();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
