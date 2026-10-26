// Wipe all data (used by `npm run db:reset` and tests). The audit table is append-only via
// triggers, so the reset drops the triggers, clears the table and recreates them.
import { getClient } from "../db";

const TABLES = [
  "alert_events",
  "alerts",
  "review_observations",
  "validation_findings",
  "ai_analysis_records",
  "validation_runs",
  "document_verifications",
  "extracted_document_fields",
  "document_pages",
  "uploaded_documents",
  "stored_blobs",
  "rectification_requests",
  "official_decisions",
  "certificate_records",
  "application_status_history",
  "applications",
  "payment_records",
  "users",
  "institutions",
  "checklist_items",
  "application_categories",
  "document_types",
  "validation_rules",
  "ruleset_versions",
  "verification_sources",
];

export async function resetDatabase() {
  const c = getClient();
  await c.execute("DROP TRIGGER IF EXISTS audit_logs_no_update");
  await c.execute("DROP TRIGGER IF EXISTS audit_logs_no_delete");
  await c.execute("DELETE FROM audit_logs");
  for (const t of TABLES) await c.execute(`DELETE FROM ${t}`);
  await c.execute("CREATE TRIGGER IF NOT EXISTS audit_logs_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;");
  await c.execute("CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;");
}
