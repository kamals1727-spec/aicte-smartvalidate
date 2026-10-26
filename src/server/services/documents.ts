import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { audit, newCorrelationId } from "../audit";
import { assertCan, assertInstitutionEditable, assertViewApplication, type Actor } from "../authz";
import { AppError, NotFoundError } from "../errors";
import { detectMime, extractDocument } from "../extraction";
import { parseFields } from "../extraction/fields";
import { getObject, newStorageKey, putObject, storageDriver } from "../storage";
import { loadApplication } from "./common";

export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024;
}

export interface UploadInput {
  applicationId: string;
  docTypeCode: string;
  caption?: string;
  replaceDocumentId?: string | null;
  fileName: string;
  bytes: Buffer;
}

export async function uploadDocument(actor: Actor, input: UploadInput) {
  assertCan(actor, "document.upload");
  const app = await loadApplication(input.applicationId);
  assertViewApplication(actor, app);
  assertInstitutionEditable(app);
  const db = getDb();

  const [docType] = await db.select().from(schema.documentTypes).where(eq(schema.documentTypes.code, input.docTypeCode));
  if (!docType) throw new AppError("Unknown document type.");

  // Server-side checks — never trust the browser's MIME type or file name.
  if (input.bytes.length === 0) throw new AppError("The file is empty.");
  if (input.bytes.length > maxUploadBytes()) {
    throw new AppError(`File is too large (${(input.bytes.length / 1048576).toFixed(1)} MB). Maximum is ${maxUploadBytes() / 1048576} MB — compress or split the PDF.`);
  }
  const mime = detectMime(input.bytes);
  if (!mime) throw new AppError("Unsupported file type. Upload a PDF, PNG or JPEG (the file content is checked, not just the extension).");

  let replaced: typeof schema.documents.$inferSelect | undefined;
  if (input.replaceDocumentId) {
    [replaced] = await db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.id, input.replaceDocumentId), eq(schema.documents.applicationId, app.id), eq(schema.documents.status, "ACTIVE")));
    if (!replaced) throw new NotFoundError("Document to replace not found.");
  }

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const driver = storageDriver();
  const ext = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
  const storageKey = newStorageKey(ext);
  await putObject(driver, storageKey, input.bytes);

  const safeName = input.fileName.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || `document.${ext}`;
  const correlationId = newCorrelationId();
  const [doc] = await db
    .insert(schema.documents)
    .values({
      applicationId: app.id,
      docTypeCode: docType.code,
      originalName: safeName,
      mimeType: mime,
      sizeBytes: input.bytes.length,
      sha256,
      storageKey,
      storageDriver: driver,
      caption: (input.caption ?? "").slice(0, 300),
      replacesId: replaced?.id ?? null,
      uploadedById: actor.id,
      extractionStatus: "PENDING",
    })
    .returning();

  if (replaced) {
    await db.update(schema.documents).set({ status: "REPLACED" }).where(eq(schema.documents.id, replaced.id));
  }

  // Text extraction / OCR (independent of AI).
  const result = await extractDocument(input.bytes, mime);
  if (result.pages.length > 0) {
    await db.insert(schema.documentPages).values(
      result.pages.map((p) => ({ documentId: doc.id, pageNumber: p.pageNumber, text: p.text, method: p.method, ocrConfidence: p.ocrConfidence })),
    );
  }
  const parsed = parseFields(result.pages);
  if (parsed.length > 0) {
    await db.insert(schema.extractedFields).values(parsed.map((f) => ({ documentId: doc.id, field: f.field, value: f.value, page: f.page, evidence: f.evidence, source: "parser" })));
  }
  await db
    .update(schema.documents)
    .set({ extractionStatus: result.status, extractionError: result.error, pageCount: result.pageCount })
    .where(eq(schema.documents.id, doc.id));
  await db.update(schema.applications).set({ documentsChangedAt: new Date(), updatedAt: new Date() }).where(eq(schema.applications.id, app.id));

  await audit(db, {
    actor,
    action: replaced ? "document.replaced" : "document.uploaded",
    entityType: "document",
    entityId: doc.id,
    entityRef: app.refNo,
    previousState: replaced?.id ?? "",
    newState: result.status,
    correlationId,
    metadata: { docType: docType.code, sizeBytes: input.bytes.length, mime, sha256, ocrUsed: result.ocrUsed, pages: result.pageCount },
  });
  if (result.status === "FAILED") {
    await audit(db, { actor: "system", action: "document.extraction_failed", entityType: "document", entityId: doc.id, entityRef: app.refNo, reason: result.error ?? "", correlationId });
  }
  return { ...doc, extractionStatus: result.status, extractionError: result.error, pageCount: result.pageCount };
}

export async function removeDocument(actor: Actor, documentId: string) {
  assertCan(actor, "document.upload");
  const db = getDb();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId));
  if (!doc) throw new NotFoundError();
  const app = await loadApplication(doc.applicationId);
  assertViewApplication(actor, app);
  assertInstitutionEditable(app);
  await db.update(schema.documents).set({ status: "REMOVED" }).where(eq(schema.documents.id, doc.id));
  await db.update(schema.applications).set({ documentsChangedAt: new Date(), updatedAt: new Date() }).where(eq(schema.applications.id, app.id));
  await audit(db, { actor, action: "document.removed", entityType: "document", entityId: doc.id, entityRef: app.refNo, previousState: "ACTIVE", newState: "REMOVED" });
}

/** Authorized file access. Returns 404 for documents the actor may not see. */
export async function getDocumentFile(actor: Actor, documentId: string) {
  const db = getDb();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId));
  if (!doc) throw new NotFoundError("Document not found.");
  const app = await loadApplication(doc.applicationId);
  assertViewApplication(actor, app);
  const bytes = await getObject(doc.storageDriver, doc.storageKey);
  return { bytes, mime: doc.mimeType, name: doc.originalName };
}
