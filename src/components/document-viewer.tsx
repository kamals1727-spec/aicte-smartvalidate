"use client";
import { useState } from "react";
import { ZoomIn, ZoomOut, ExternalLink } from "lucide-react";
import { Badge, btnClass } from "./ui";
import { cn, formatBytes } from "@/lib/utils";

export interface ViewerDoc {
  id: string;
  name: string;
  typeLabel: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
  pageCount: number;
  extractionStatus: string;
  pages: { pageNumber: number; text: string; method: string; ocrConfidence: number | null }[];
  /** values that differ from the application → highlighted in the text */
  highlights: string[];
}

function highlight(text: string, needles: string[]) {
  const ns = needles.filter((n) => n && n.length > 2);
  if (ns.length === 0) return text;
  const re = new RegExp(`(${ns.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-bad-bg px-0.5 text-bad">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function DocumentViewer({ docs }: { docs: ViewerDoc[] }) {
  const [active, setActive] = useState(docs[0]?.id);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [tab, setTab] = useState<"preview" | "text">("preview");
  const d = docs.find((x) => x.id === active);
  if (!d) return <div className="rounded-lg border border-line bg-white p-6 text-sm text-muted">No documents uploaded.</div>;
  const url = `/api/documents/${d.id}/file`;
  const isPdf = d.mime === "application/pdf";
  const pageText = d.pages.find((p) => p.pageNumber === page) ?? d.pages[0];

  return (
    <div className="flex h-full flex-col rounded-lg border border-line bg-white">
      <div className="border-b border-line p-2">
        <label htmlFor="doc-select" className="sr-only">
          Document
        </label>
        <select
          id="doc-select"
          value={active}
          onChange={(e) => {
            setActive(e.target.value);
            setPage(1);
            setZoom(1);
          }}
          className="w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm"
        >
          {docs.map((x) => (
            <option key={x.id} value={x.id}>
              {x.typeLabel} — {x.name}
            </option>
          ))}
        </select>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div role="tablist" className="flex rounded-md bg-paper p-0.5 text-sm">
            {(["preview", "text"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded px-2.5 py-1", tab === t ? "bg-white font-medium shadow-sm" : "text-muted")}>
                {t === "preview" ? "Original" : "Extracted text"}
              </button>
            ))}
          </div>
          {d.pageCount > 1 && (
            <div className="flex items-center gap-1 text-sm">
              <button className={btnClass("secondary", "sm")} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page">
                ‹
              </button>
              <span className="tabular-nums">
                {page} / {d.pageCount}
              </span>
              <button className={btnClass("secondary", "sm")} onClick={() => setPage((p) => Math.min(d.pageCount, p + 1))} disabled={page >= d.pageCount} aria-label="Next page">
                ›
              </button>
            </div>
          )}
          {!isPdf && tab === "preview" && (
            <div className="flex items-center gap-1">
              <button className={btnClass("secondary", "sm")} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
              <button className={btnClass("secondary", "sm")} onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in">
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <a href={url} target="_blank" rel="noreferrer" className={cn(btnClass("ghost", "sm"), "ml-auto")}>
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </a>
        </div>
      </div>

      <div className="min-h-[420px] flex-1 overflow-auto bg-slate-100">
        {tab === "preview" ? (
          isPdf ? (
            <iframe key={`${d.id}-${page}`} src={`${url}#page=${page}&view=FitH`} title={`Preview of ${d.name}`} className="h-[640px] w-full bg-white" />
          ) : (
            <div className="p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Uploaded image ${d.name}`} style={{ width: `${zoom * 100}%` }} className="mx-auto max-w-none bg-white shadow" />
            </div>
          )
        ) : (
          <div className="p-3">
            {pageText ? (
              <>
                <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                  <span>Page {pageText.pageNumber}</span>
                  <Badge tone={pageText.method === "ocr" ? "info" : pageText.method === "none" ? "danger" : "neutral"}>{pageText.method === "ocr" ? "OCR" : pageText.method === "none" ? "No text" : "PDF text layer"}</Badge>
                  {pageText.ocrConfidence !== null && <span>engine confidence {Math.round(pageText.ocrConfidence)} (not a calibrated probability)</span>}
                </div>
                <pre className="whitespace-pre-wrap rounded bg-white p-3 font-mono text-xs leading-relaxed text-ink">{pageText.text ? highlight(pageText.text, d.highlights) : "(no text extracted)"}</pre>
                {d.highlights.length > 0 && <p className="mt-2 text-xs text-muted">Highlighted values differ from the application.</p>}
              </>
            ) : (
              <p className="text-sm text-muted">No extracted text.</p>
            )}
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2 border-t border-line p-3 text-xs">
        <div>
          <dt className="text-muted">Type / size</dt>
          <dd>
            {d.mime} · {formatBytes(d.sizeBytes)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Uploaded</dt>
          <dd>{new Date(d.uploadedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted">SHA-256</dt>
          <dd className="break-all font-mono">{d.sha256}</dd>
        </div>
      </dl>
    </div>
  );
}
