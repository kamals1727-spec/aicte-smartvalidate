// Storage abstraction for uploaded documents. Files are NEVER placed under /public and are
// only served through the authorized /api/documents/[id]/file route.
//   local    → private folder on disk (UPLOAD_DIR, default ./storage/uploads)
//   database → bytes in the stored_blobs table (for serverless hosts without a persistent disk)
// A protected object store (S3/GCS/Azure Blob with private ACLs) can be added as another driver.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";

export type StorageDriver = "local" | "database";

export function storageDriver(): StorageDriver {
  const d = process.env.STORAGE_DRIVER;
  if (d === "database" || d === "local") return d;
  // Serverless platforms have no persistent writable disk.
  return process.env.VERCEL ? "database" : "local";
}

function uploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR || "./storage/uploads");
}

/** Storage keys are server-generated UUIDs — user-supplied names never touch the filesystem. */
export function newStorageKey(ext: string): string {
  const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : "bin";
  return `${randomUUID()}.${safeExt}`;
}

function resolveLocal(key: string): string {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/.test(key)) throw new Error("Invalid storage key");
  const root = uploadRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Path traversal blocked");
  return full;
}

export async function putObject(driver: StorageDriver, key: string, data: Buffer): Promise<void> {
  if (driver === "local") {
    await mkdir(uploadRoot(), { recursive: true });
    await writeFile(resolveLocal(key), data, { mode: 0o600 });
  } else {
    await getDb().insert(schema.storedBlobs).values({ key, data });
  }
}

export async function getObject(driver: string, key: string): Promise<Buffer> {
  if (driver === "local") return readFile(resolveLocal(key));
  const [row] = await getDb().select().from(schema.storedBlobs).where(eq(schema.storedBlobs.key, key)).limit(1);
  if (!row) throw new Error("Stored object not found");
  return Buffer.from(row.data);
}
