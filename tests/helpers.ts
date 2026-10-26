import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { migrate } from "drizzle-orm/libsql/migrator";
import { resetDbForTests } from "@/server/db";
import { seedReference } from "@/server/demo/reference";

/** Fresh, migrated SQLite database in a temp dir (never touches dev.db). */
export async function freshDb(withReference = true) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "sv-test-"));
  process.env.UPLOAD_DIR = path.join(dir, "uploads");
  process.env.STORAGE_DRIVER = "local";
  process.env.AI_PROVIDER = "mock";
  const db = resetDbForTests(`file:${path.join(dir, "test.db")}`);
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  if (withReference) await seedReference();
  return db;
}
