import type { Config } from "drizzle-kit";

// Used only by `drizzle-kit generate` to produce SQL migrations from the schema.
// Migrations are applied at runtime-agnostic time by scripts/migrate.ts (works for a
// local SQLite file and for hosted libSQL/Turso).
export default {
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
} satisfies Config;
