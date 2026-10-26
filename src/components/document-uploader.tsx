"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, RefreshCw, Trash2, FileText, Image as ImageIcon } from "lucide-react";
import { Badge, btnClass, inputClass } from "./ui";
import { ActionForm, SubmitButton } from "./action-form";
import { removeDocumentAction } from "@/app/actions";
import { VERIFICATION_STATUSES, VERIFICATION_TONE, type VerificationStatus } from "@/lib/constants";
import { cn, formatBytes } from "@/lib/utils";

export interface DocSummary {
  id: string;
  docTypeCode: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  extractionStatus: string;
  extractionError: string | null;
  verificationStatus: string;
  caption: string;
  findingCount: number;
  pageCount: number;
}

interface ChecklistRow {
  docTypeCode: string;
  label: string;
  mandatory: boolean;
  isInfrastructure: boolean;
}

const EXTRACTION_LABEL: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  DONE: { label: "Text extracted", tone: "success" },
  PARTIAL: { label: "Partially extracted", tone: "warning" },
  FAILED: { label: "Extraction failed", tone: "danger" },
  PENDING: { label: "Extraction pending", tone: "neutral" },
};

export function DocumentUploader({
  applicationId,
  checklist,
  otherTypes,
  documents,
  editable,
  maxMb,
}: {
  applicationId: string;
  checklist: ChecklistRow[];
  otherTypes: { code: string; label: string }[];
  documents: DocSummary[];
  editable: boolean;
  maxMb: number;
}) {
  const extra = documents.filter((d) => !checklist.some((c) => c.docTypeCode === d.docTypeCode));
  return (
    <div className="space-y-3">
      {checklist.map((c) => (
        <ChecklistSlot key={c.docTypeCode} applicationId={applicationId} row={c} docs={documents.filter((d) => d.docTypeCode === c.docTypeCode)} editable={editable} maxMb={maxMb} />
      ))}
      {(extra.length > 0 || editable) && (
        <div className="rounded-lg border border-line p-3">
          <div className="text-sm font-medium">Other supporting documents</div>
          <p className="text-xs text-muted">Optional uploads outside the checklist.</p>
          <div className="mt-2 space-y-2">
            {extra.map((d) => (
              <DocRow key={d.id} d={d} applicationId={applicationId} editable={editable} maxMb={maxMb} label={otherTypes.find((t) => t.code === d.docTypeCode)?.label ?? d.docTypeCode} />
            ))}
          </div>
          {editable && <UploadControl applicationId={applicationId} types={otherTypes} maxMb={maxMb} />}
        </div>
      )}
    </div>
  );
}

function ChecklistSlot({ applicationId, row, docs, editable, maxMb }: { applicationId: string; row: ChecklistRow; docs: DocSummary[]; editable: boolean; maxMb: number }) {
  const missing = docs.length === 0;
  return (
    <div className={cn("rounded-lg border p-3", missing && row.mandatory ? "border-bad/30 bg-bad-bg/30" : "border-line")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{row.label}</span>
          {row.mandatory ? <Badge tone="danger">Mandatory</Badge> : <Badge>Optional</Badge>}
          {row.isInfrastructure && <Badge tone="info">Infrastructure evidence</Badge>}
        </div>
        {missing && <span className="text-xs text-muted">Not uploaded</span>}
      </div>
      <div className="mt-2 space-y-2">
        {docs.map((d) => (
          <DocRow key={d.id} d={d} applicationId={applicationId} editable={editable} maxMb={maxMb} />
        ))}
      </div>
      {editable && missing && <UploadControl applicationId={applicationId} fixedType={row.docTypeCode} maxMb={maxMb} withCaption={row.isInfrastructure} />}
    </div>
  );
}

function DocRow({ d, applicationId, editable, maxMb, label }: { d: DocSummary; applicationId: string; editable: boolean; maxMb: number; label?: string }) {
  const [replacing, setReplacing] = useState(false);
  const ex = EXTRACTION_LABEL[d.extractionStatus] ?? EXTRACTION_LABEL.PENDING;
  const Icon = d.mimeType.startsWith("image/") ? ImageIcon : FileText;
  return (
    <div className="rounded-md border border-line bg-white p-2.5">
      <div className="flex flex-wrap items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" className="break-all text-sm font-medium text-action hover:underline">
            {d.originalName}
          </a>
          {label && <span className="ml-2 text-xs text-muted">{label}</span>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>{formatBytes(d.sizeBytes)}</span>
            <span>· {d.pageCount} page(s)</span>
            <span>· uploaded {new Date(d.uploadedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
          </div>
          {d.caption && <p className="mt-1 text-xs text-ink">Caption: {d.caption}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone="success">Uploaded</Badge>
            <Badge tone={ex.tone}>{ex.label}</Badge>
            <Badge tone={VERIFICATION_TONE[d.verificationStatus as VerificationStatus]}>{VERIFICATION_STATUSES[d.verificationStatus as VerificationStatus] ?? d.verificationStatus}</Badge>
            <Badge tone={d.findingCount > 0 ? "warning" : "neutral"}>{d.findingCount > 0 ? `${d.findingCount} finding(s) in latest run` : "No findings in latest run"}</Badge>
          </div>
          {d.extractionError && <p className="mt-1.5 text-xs text-warn">{d.extractionError}</p>}
        </div>
        {editable && (
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setReplacing((r) => !r)} className={btnClass("secondary", "sm")} aria-expanded={replacing}>
              <RefreshCw className="h-3.5 w-3.5" /> Replace
            </button>
            <ActionForm action={removeDocumentAction} confirm={`Remove ${d.originalName}?`}>
              <input type="hidden" name="documentId" value={d.id} />
              <input type="hidden" name="applicationId" value={applicationId} />
              <SubmitButton variant="ghost" size="sm" pendingText="Removing…">
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </SubmitButton>
            </ActionForm>
          </div>
        )}
      </div>
      {replacing && <UploadControl applicationId={applicationId} fixedType={d.docTypeCode} replaceId={d.id} maxMb={maxMb} onDone={() => setReplacing(false)} />}
    </div>
  );
}

function UploadControl({
  applicationId,
  fixedType,
  types,
  replaceId,
  maxMb,
  withCaption,
  onDone,
}: {
  applicationId: string;
  fixedType?: string;
  types?: { code: string; label: string }[];
  replaceId?: string;
  maxMb: number;
  withCaption?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [type, setType] = useState(fixedType ?? types?.[0]?.code ?? "");
  const [caption, setCaption] = useState("");

  function upload(file: File) {
    setMsg(null);
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) {
      setMsg({ ok: false, text: "Only PDF, PNG or JPEG files are accepted." });
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setMsg({ ok: false, text: `File is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${maxMb} MB — compress or split it.` });
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("docTypeCode", type);
    fd.append("caption", caption);
    if (replaceId) fd.append("replaceDocumentId", replaceId);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/applications/${applicationId}/documents`);
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      let body: { message?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        setMsg({ ok: true, text: body.message ?? "Uploaded." });
        if (fileRef.current) fileRef.current.value = "";
        onDone?.();
        router.refresh();
      } else {
        setMsg({ ok: false, text: body.error ?? `Upload failed (HTTP ${xhr.status}). Try again.` });
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setMsg({ ok: false, text: "Network error during upload. Check your connection and retry." });
    };
    xhr.send(fd);
  }

  return (
    <div className="mt-2 rounded-md border border-dashed border-line bg-paper p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {types && (
          <select aria-label="Document type" value={type} onChange={(e) => setType(e.target.value)} className={cn(inputClass, "w-auto py-1.5")}>
            {types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        {(withCaption || types) && (
          <input aria-label="Caption" placeholder="Caption / description (recommended for photos)" value={caption} onChange={(e) => setCaption(e.target.value)} className={cn(inputClass, "w-64 py-1.5")} />
        )}
        <label className={cn(btnClass("secondary", "sm"), "cursor-pointer", progress !== null && "pointer-events-none opacity-60")}>
          <Upload className="h-3.5 w-3.5" />
          {replaceId ? "Choose replacement file" : "Choose file"}
          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} disabled={progress !== null} />
        </label>
        <span className="text-xs text-muted">PDF, PNG or JPEG · max {maxMb} MB</span>
      </div>
      {progress !== null && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200">
            <div className="h-full bg-action transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{progress < 100 ? `Uploading… ${progress}%` : "Extracting text / running OCR…"}</p>
        </div>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={cn("mt-2 text-xs", msg.ok ? "text-ok" : "text-bad")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
