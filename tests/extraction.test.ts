import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectMime, extractDocument } from "@/server/extraction";
import { makeTextPdf } from "@/server/demo/pdf";

const SAMPLES = path.resolve(__dirname, "../samples");

describe("text extraction and OCR (no AI involved)", () => {
  it("detects file types from content, not extension", () => {
    expect(detectMime(makeTextPdf("t", ["x"]))).toBe("application/pdf");
    expect(detectMime(readFileSync(path.join(SAMPLES, "06_fire_safety_scanned.png")))).toBe("image/png");
    expect(detectMime(Buffer.from("hello"))).toBeNull();
  });

  it("reads the PDF text layer", async () => {
    const r = await extractDocument(makeTextPdf("Title", ["Valid Until: 01/01/2030"]), "application/pdf");
    expect(r.status).toBe("DONE");
    expect(r.pages[0]).toMatchObject({ method: "text_layer" });
    expect(r.pages[0].text).toContain("Valid Until: 01/01/2030");
  });

  it("OCRs a scanned PDF page with the locally bundled language data", async () => {
    const r = await extractDocument(readFileSync(path.join(SAMPLES, "07_fire_safety_scanned.pdf")), "application/pdf");
    expect(r.ocrUsed).toBe(true);
    expect(r.pages[0].method).toBe("ocr");
    expect(r.pages[0].text).toContain("FIRE-DEMO-2026-0311");
  });

  it("returns a specific error for corrupt PDFs", async () => {
    const r = await extractDocument(Buffer.from("%PDF-1.4\ngarbage"), "application/pdf");
    expect(r.status).toBe("FAILED");
    expect(r.error).toMatch(/corrupt|could not be read/);
  });
});
