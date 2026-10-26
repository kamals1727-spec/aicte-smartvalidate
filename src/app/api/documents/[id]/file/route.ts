import { getActor } from "@/server/auth/actor";
import { getDocumentFile } from "@/server/services/documents";
import { AppError } from "@/server/errors";

export const runtime = "nodejs";

// Private document access: authenticated + authorized per document. Never a public URL.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const f = await getDocumentFile(actor, id);
    return new Response(new Uint8Array(f.bytes), {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": `inline; filename="${f.name.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'",
      },
    });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    return Response.json({ error: err instanceof AppError ? err.message : "Could not load the document." }, { status });
  }
}
