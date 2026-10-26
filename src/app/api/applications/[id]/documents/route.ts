import { getActor } from "@/server/auth/actor";
import { uploadDocument, maxUploadBytes } from "@/server/services/documents";
import { AppError } from "@/server/errors";

export const runtime = "nodejs";
export const maxDuration = 60; // OCR of scanned pages can take a few seconds

// Multipart upload. Same-origin check acts as CSRF protection for this cookie-authenticated endpoint.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return Response.json({ error: "Cross-site request blocked." }, { status: 403 });
  }
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await ctx.params;

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxUploadBytes() + 512 * 1024) {
    return Response.json({ error: `File is too large. Maximum is ${maxUploadBytes() / 1048576} MB.` }, { status: 413 });
  }
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return Response.json({ error: "Upload could not be read. Try again." }, { status: 400 });
  }
  const file = fd.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  try {
    const doc = await uploadDocument(actor, {
      applicationId: id,
      docTypeCode: String(fd.get("docTypeCode") ?? ""),
      caption: String(fd.get("caption") ?? ""),
      replaceDocumentId: (fd.get("replaceDocumentId") as string) || null,
      fileName: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return Response.json({
      id: doc.id,
      extractionStatus: doc.extractionStatus,
      message:
        doc.extractionStatus === "DONE"
          ? "Uploaded and text extracted."
          : doc.extractionStatus === "PARTIAL"
            ? `Uploaded. ${doc.extractionError ?? "Some text could not be extracted."}`
            : `Uploaded, but text extraction failed: ${doc.extractionError ?? "unknown reason"}`,
    });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    if (!(err instanceof AppError)) console.error("[upload error]", err instanceof Error ? err.message : "unknown");
    return Response.json({ error: err instanceof AppError ? err.message : "Upload failed. Try again." }, { status });
  }
}
