/**
 * Apply SQL migrations in ./drizzle to the database in DATABASE_URL.
 * Works for a local SQLite file (file:./dev.db) and hosted libSQL/Turso (libsql://...).
 *   npm run db:migrate
 */
import "./load-env";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getClient, getDb } from "../src/server/db";

async function main() {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  console.log(`Applying migrations to ${url.startsWith("file:") ? url : url.replace(/\/\/.*@/, "//***@")}`);
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  getClient().close();
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
