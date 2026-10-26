// Text extraction + OCR. Runs entirely on the server and does NOT depend on any AI provider.
//  1. PDF text layer via unpdf (serverless build of Mozilla pdf.js).
//  2. Pages with too little text → the page's embedded scan image is extracted and OCR'd
//     with tesseract.js using the English language data shipped in node_modules
//     (@tesseract.js-data/eng) — no CDN download at runtime.
//  3. PNG/JPEG uploads are OCR'd directly.
import path from "node:path";
import { existsSync } from "node:fs";
import { encodePng } from "./png";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  method: "text_layer" | "ocr" | "none";
  ocrConfidence: number | null;
}

export interface ExtractionResult {
  status: "DONE" | "PARTIAL" | "FAILED";
  pages: ExtractedPage[];
  pageCount: number;
  error: string | null;
  ocrUsed: boolean;
}

const MAX_OCR_PAGES = 10;

export function detectMime(buf: Buffer): "application/pdf" | "image/png" | "image/jpeg" | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  return null;
}

export function ocrLangPath(): string {
  if (process.env.OCR_LANG_PATH) return process.env.OCR_LANG_PATH;
  return path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");
}

export function ocrAvailable(): { ok: boolean; detail: string } {
  const p = path.join(ocrLangPath(), "eng.traineddata.gz");
  return existsSync(p)
    ? { ok: true, detail: "tesseract.js with bundled English language data" }
    : { ok: false, detail: "English OCR language data not found (run npm install)" };
}

async function ocrImages(images: Buffer[]): Promise<{ text: string; confidence: number }[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    langPath: ocrLangPath(),
    gzip: true,
    cacheMethod: "none",
  });
  try {
    const out: { text: string; confidence: number }[] = [];
    for (const img of images) {
      const r = await worker.recognize(img);
      out.push({ text: r.data.text ?? "", confidence: r.data.confidence ?? 0 });
    }
    return out;
  } finally {
    await worker.terminate();
  }
}

function minChars(): number {
  const n = Number(process.env.OCR_MIN_TEXT_CHARS);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

export async function extractDocument(buf: Buffer, mime: string): Promise<ExtractionResult> {
  try {
    if (mime === "image/png" || mime === "image/jpeg") {
      const [r] = await ocrImages([buf]);
      const text = r.text.trim();
      return {
        status: text.length > 0 ? "DONE" : "PARTIAL",
        pages: [{ pageNumber: 1, text, method: text ? "ocr" : "none", ocrConfidence: r.confidence }],
        pageCount: 1,
        error: text.length > 0 ? null : "OCR found no readable text in the image. Upload a clearer scan.",
        ocrUsed: true,
      };
    }
    if (mime !== "application/pdf") {
      return { status: "FAILED", pages: [], pageCount: 0, error: "Unsupported file type.", ocrUsed: false };
    }
    return await extractPdf(buf);
  } catch (err) {
    return { status: "FAILED", pages: [], pageCount: 0, error: friendlyError(err), ocrUsed: false };
  }
}

async function extractPdf(buf: Buffer): Promise<ExtractionResult> {
  const { getDocumentProxy, extractText, extractImages } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages: ExtractedPage[] = text.map((t, i) => ({
    pageNumber: i + 1,
    text: t.trim(),
    method: t.trim().length > 0 ? "text_layer" : "none",
    ocrConfidence: null,
  }));

  // Pages that look scanned → OCR their largest embedded image.
  const needOcr = pages.filter((p) => p.text.length < minChars()).slice(0, MAX_OCR_PAGES);
  let ocrUsed = false;
  let partialReason: string | null = null;
  if (needOcr.length > 0) {
    const imgs: { page: ExtractedPage; png: Buffer }[] = [];
    for (const p of needOcr) {
      const found = await extractImages(pdf, p.pageNumber);
      if (found.length === 0) continue;
      const biggest = found.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
      if (biggest.width < 200 || biggest.height < 200) continue;
      imgs.push({ page: p, png: encodePng(biggest.width, biggest.height, biggest.channels, biggest.data) });
    }
    if (imgs.length > 0) {
      ocrUsed = true;
      const results = await ocrImages(imgs.map((i) => i.png));
      results.forEach((r, i) => {
        const pg = imgs[i].page;
        const t = r.text.trim();
        if (t.length > pg.text.length) {
          pg.text = t;
          pg.method = "ocr";
          pg.ocrConfidence = r.confidence;
        }
      });
    }
    if (pages.filter((p) => p.text.length < minChars()).length > 0) {
      partialReason =
        "Some pages contained little or no machine-readable text (vector drawings or unsupported scan format). Those pages need manual reading.";
    }
  }
  const anyText = pages.some((p) => p.text.length > 0);
  return {
    status: !anyText ? "FAILED" : partialReason ? "PARTIAL" : "DONE",
    pages,
    pageCount: totalPages,
    error: !anyText ? "No readable text could be extracted from this PDF. Upload a clearer scan or a text-based PDF." : partialReason,
    ocrUsed,
  };
}

function friendlyError(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  const msg = err instanceof Error ? err.message : String(err);
  if (name === "PasswordException" || /password/i.test(msg)) {
    return "This PDF is password-protected. Remove the password (or print to a new PDF) and upload it again.";
  }
  if (name === "InvalidPDFException" || /invalid pdf|bad xref|unexpected/i.test(msg)) {
    return "This PDF appears to be corrupt or incomplete. Re-export it from the original source and upload again.";
  }
  return "The document could not be read. Try re-saving it as a standard PDF/PNG/JPEG and upload again.";
}
