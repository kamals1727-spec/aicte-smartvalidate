import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

function makeClient(): Client {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;
  return createClient({ url, authToken });
}

// Re-use one client across hot reloads in development.
const g = globalThis as unknown as { __svClient?: Client; __svDb?: DB };

export function getClient(): Client {
  if (!g.__svClient) g.__svClient = makeClient();
  return g.__svClient;
}

export function getDb(): DB {
  if (!g.__svDb) {
    g.__svDb = drizzle(getClient(), { schema });
  }
  return g.__svDb;
}

/** Test helper: point the singleton at a different database. */
export function resetDbForTests(url: string) {
  g.__svClient?.close();
  g.__svClient = createClient({ url });
  g.__svDb = drizzle(g.__svClient, { schema });
  return g.__svDb;
}

export { schema };
