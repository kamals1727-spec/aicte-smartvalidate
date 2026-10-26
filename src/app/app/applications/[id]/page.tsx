import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { requireActorPage } from "@/server/auth/actor";
import { getApplicationDetail } from "@/server/services/applications";
import { maxUploadBytes } from "@/server/services/documents";
import { NotFoundError } from "@/server/errors";
import { getDb, schema } from "@/server/db";
import { Badge, Card, DL, PageHeader, Field, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DocumentUploader } from "@/components/document-uploader";
import { FindingCard } from "@/components/finding-card";
import { ExtractedText, PriorityExplainer, RunSummary, StatusTimeline } from "@/components/case-parts";
import { respondRectificationAction, runValidationAction, submitApplicationAction, updateApplicationAction, withdrawApplicationAction } from "@/app/actions";
import { INSTITUTION_EDITABLE, STATUS_LABELS, STATUS_TONE, type AppStatus } from "@/lib/constants";
import { cn, formatDate, formatINR } from "@/lib/utils";

export const metadata = { title: "Application" };

export default async function ApplicationWorkspace({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const actor = await requireActorPage();
  const { id } = await params;
  if (actor.role !== "INSTITUTION") redirect(`/app/review/${id}`);
  const sp = await searchParams;
  let d;
  try {
    d = await getApplicationDetail(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { app } = d;
  const editable = (INSTITUTION_EDITABLE as string[]).includes(app.status);
  const docTypes = await getDb().select().from(schema.documentTypes).orderBy(asc(schema.documentTypes.label));
  const findingCountByDoc = new Map<string, number>();
  for (const f of d.findings) if (f.documentId) findingCountByDoc.set(f.documentId, (findingCountByDoc.get(f.documentId) ?? 0) + 1);
  const docName = (docId: string | null) => d.documents.find((x) => x.id === docId)?.originalName ?? null;
  const criticalOpen = d.findings.filter((f) => f.severity === "CRITICAL" && f.reviewStatus === "OPEN").length;
  const openRect = d.rectifications.filter((r) => r.status === "OPEN");
  const missingMandatory = d.checklist.filter((c) => c.mandatory && !d.documents.some((x) => x.docTypeCode === c.docTypeCode && x.status === "ACTIVE"));

  const steps = [
    { label: "Details", done: true },
    { label: "Documents", done: missingMandatory.length === 0 },
    { label: "Validation", done: d.validationIsCurrent },
    { label: "Submission", done: !!app.submittedAt && !editable },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/app/applications", label: "My applications" }, { label: app.refNo }]}
        title={<span className="tabular-nums">{app.refNo}</span>}
        subtitle={`${d.category.name} · Academic year ${app.academicYear} · ${d.institution.name}`}
        actions={<Badge tone={STATUS_TONE[app.status as AppStatus]} className="px-3 py-1 text-sm">{STATUS_LABELS[app.status as AppStatus]}</Badge>}
      />
      {sp.created && <p className="mb-4 rounded-md bg-ok-bg px-3 py-2 text-sm text-ok">Draft created. Upload the documents in the checklist, then run validation.</p>}

      <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s.label} className={cn("rounded-md border px-3 py-2 text-sm", s.done ? "border-ok/30 bg-ok-bg text-ok" : "border-line bg-white text-muted")}>
            <span className="font-medium">{i + 1}. {s.label}</span>
            <span className="ml-1 text-xs">{s.done ? "complete" : "to do"}</span>
          </li>
        ))}
      </ol>

      {openRect.length > 0 && (
        <Card title="Clarification requested by the scrutiny officer" className="mb-6 border-warn/40">
          {openRect.map((r) => (
            <div key={r.id} className="space-y-3">
              <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-ink">{r.message}</p>
              <p className="text-xs text-muted">Requested {formatDate(r.createdAt, true)}</p>
              <ActionForm action={respondRectificationAction}>
                <input type="hidden" name="rectificationId" value={r.id} />
                <input type="hidden" name="applicationId" value={app.id} />
                <Field label="Your response" htmlFor={`resp-${r.id}`}>
                  <textarea id={`resp-${r.id}`} name="response" rows={3} className={inputClass} placeholder="Explain what you have corrected or uploaded" />
                </Field>
                <div className="mt-2">
                  <SubmitButton size="sm">Send response</SubmitButton>
                </div>
              </ActionForm>
            </div>
          ))}
          <p className="mt-3 text-xs text-muted">After responding: replace or add documents, re-run validation, then resubmit below.</p>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <Card title="Documents" description={`Checklist for ${d.category.name} (demo configuration). Files are stored privately and fingerprinted with SHA-256.`}>
            <DocumentUploader
              applicationId={app.id}
              editable={editable}
              maxMb={maxUploadBytes() / 1048576}
              checklist={d.checklist.map((c) => ({ docTypeCode: c.docTypeCode, label: c.label, mandatory: c.mandatory, isInfrastructure: c.isInfrastructure }))}
              otherTypes={docTypes.map((t) => ({ code: t.code, label: t.label }))}
              documents={d.documents
                .filter((x) => x.status === "ACTIVE")
                .map((x) => ({
                  id: x.id,
                  docTypeCode: x.docTypeCode,
                  originalName: x.originalName,
                  mimeType: x.mimeType,
                  sizeBytes: x.sizeBytes,
                  uploadedAt: x.uploadedAt.toISOString(),
                  extractionStatus: x.extractionStatus,
                  extractionError: x.extractionError,
                  verificationStatus: x.verificationStatus,
                  caption: x.caption,
                  findingCount: findingCountByDoc.get(x.id) ?? 0,
                  pageCount: x.pageCount,
                }))}
            />
          </Card>

          <Card
            title="AI-assisted validation"
            description="Deterministic rules run first; the AI layer then explains findings and flags potential inconsistencies. Results are preliminary and need human review."
            actions={
              editable ? (
                <ActionForm action={runValidationAction}>
                  <input type="hidden" name="applicationId" value={app.id} />
                  <SubmitButton pendingText="Validating — extracting, checking rules, asking AI…">Run AI-assisted validation</SubmitButton>
                </ActionForm>
              ) : undefined
            }
          >
            {d.latestRun ? (
              <>
                {!d.validationIsCurrent && <p className="mb-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">Documents or details changed after this run. Re-run validation before submitting.</p>}
                <RunSummary run={d.latestRun} />
              </>
            ) : (
              <p className="text-sm text-muted">Not validated yet. Upload documents, then run validation to see missing, expired and mismatched items.</p>
            )}
          </Card>

          {d.latestRun && (
            <section>
              <h2 className="mb-3 text-[15px] font-semibold">Findings ({d.findings.length})</h2>
              {d.findings.length === 0 ? (
                <p className="rounded-lg border border-line bg-white p-4 text-sm text-muted">No rule raised a finding. This is not a statement of compliance — authenticity and source verification still need official review.</p>
              ) : (
                <div className="space-y-3">
                  {d.findings.map((f) => (
                    <FindingCard key={f.id} f={f} documentName={docName(f.documentId)} anchor />
                  ))}
                </div>
              )}
            </section>
          )}

          {d.documents.length > 0 && (
            <Card title="Extracted text and OCR results" description="What the system read from each document, page by page.">
              <div className="space-y-2">
                {d.documents
                  .filter((x) => x.status === "ACTIVE")
                  .map((x) => (
                    <ExtractedText key={x.id} doc={x} />
                  ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Review and submit">
            {editable ? (
              <ActionForm action={submitApplicationAction} confirm="Submit this application for official scrutiny?">
                <input type="hidden" name="applicationId" value={app.id} />
                <ul className="mb-3 space-y-1 text-sm">
                  <li className={missingMandatory.length ? "text-bad" : "text-ok"}>{missingMandatory.length ? `${missingMandatory.length} mandatory document(s) missing` : "All mandatory documents uploaded"}</li>
                  <li className={d.validationIsCurrent ? "text-ok" : "text-bad"}>{d.validationIsCurrent ? "Validation is up to date" : "Validation must be (re-)run"}</li>
                  <li className={criticalOpen ? "text-bad" : "text-ok"}>{criticalOpen ? `${criticalOpen} critical finding(s) block submission` : "No critical findings"}</li>
                  <li className="text-muted">{d.findings.filter((f) => f.severity === "HIGH").length} high-severity finding(s) will go to the officer for review</li>
                </ul>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="declaration" className="mt-1" />
                  <span>I declare that the information and documents submitted are true and complete to the best of my knowledge (demo declaration).</span>
                </label>
                <p className="mt-2 text-xs text-muted">Uploading every file does not make an application compliant. Officials review all findings before any decision.</p>
                <div className="mt-3">
                  <SubmitButton pendingText="Submitting…">{app.status === "CLARIFICATION_REQUESTED" ? "Resubmit application" : "Submit for scrutiny"}</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted">
                {app.status === "APPROVED" || app.status === "REJECTED"
                  ? "An official decision has been recorded by an authorized user."
                  : app.status === "WITHDRAWN"
                    ? "This application was withdrawn."
                    : `Submitted ${formatDate(app.submittedAt, true)}. It is with AICTE scrutiny and can no longer be edited.`}
              </p>
            )}
            {d.decisions.map((x) => (
              <div key={x.id} className="mt-3 rounded-md border border-line p-3 text-sm">
                <div className="font-medium">Official decision: {x.decision === "APPROVED" ? "Approved" : "Rejected"} by authorized authority</div>
                <p className="mt-1 text-muted">{x.reason}</p>
                <p className="mt-1 text-xs text-muted">
                  {x.by} · {formatDate(x.createdAt, true)}
                </p>
              </div>
            ))}
            {d.certificates.map((c) => (
              <Link key={c.id} href={`/app/certificates/${c.id}`} className="mt-3 block text-sm text-action hover:underline">
                View demo certificate record {c.certificateRef}
              </Link>
            ))}
          </Card>

          <Card title="Application details">
            <DL
              items={[
                ["Institution", app.declaredInstitutionName],
                ["Institution reference", app.declaredInstitutionRef],
                ["Programme / course", app.programmeName],
                ["Approved → proposed intake", app.approvedIntake !== null || app.proposedIntake !== null ? `${app.approvedIntake ?? "—"} → ${app.proposedIntake ?? "—"}` : ""],
                ["Previous approval ref.", app.previousApprovalRef],
                ["Accreditation", app.accreditationDetails],
                ["Contact", `${app.contactName}${app.contactEmail ? ` · ${app.contactEmail}` : ""}`],
                ["Payment reference", app.paymentReference ? `${app.paymentReference} · ${formatINR(app.paymentAmount)}` : ""],
              ]}
            />
            {editable && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-action">Edit details</summary>
                <ActionForm action={updateApplicationAction} className="mt-3 space-y-3">
                  <input type="hidden" name="applicationId" value={app.id} />
                  {(
                    [
                      ["declaredInstitutionName", "Institution name", app.declaredInstitutionName],
                      ["declaredInstitutionRef", "Institution reference ID", app.declaredInstitutionRef],
                      ["academicYear", "Academic year", app.academicYear],
                      ["address", "Address", app.address],
                      ["state", "State", app.state],
                      ["affiliatedUniversity", "Affiliated university", app.affiliatedUniversity],
                      ["programmeName", "Programme / course", app.programmeName],
                      ["approvedIntake", "Approved intake", app.approvedIntake ?? ""],
                      ["proposedIntake", "Proposed intake", app.proposedIntake ?? ""],
                      ["previousApprovalRef", "Previous approval ref.", app.previousApprovalRef],
                      ["accreditationDetails", "Accreditation details", app.accreditationDetails],
                      ["contactName", "Contact name", app.contactName],
                      ["contactEmail", "Contact email", app.contactEmail],
                      ["contactPhone", "Contact phone", app.contactPhone],
                      ["paymentReference", "Payment reference", app.paymentReference],
                      ["paymentAmount", "Amount paid (₹)", app.paymentAmount ?? ""],
                    ] as [string, string, string | number][]
                  ).map(([name, label, value]) => (
                    <Field key={name} label={label} htmlFor={`e-${name}`}>
                      <input id={`e-${name}`} name={name} defaultValue={String(value)} className={inputClass} />
                    </Field>
                  ))}
                  <SubmitButton size="sm">Save details</SubmitButton>
                </ActionForm>
              </details>
            )}
          </Card>

          <Card title="Review priority">
            <PriorityExplainer level={app.reviewPriority} score={app.priorityScore} factors={app.priorityFactors} />
          </Card>

          <Card title="Status history">
            <StatusTimeline history={d.history} />
          </Card>

          {editable && (
            <Card title="Withdraw application">
              <ActionForm action={withdrawApplicationAction} confirm="Withdraw this application? This cannot be undone.">
                <input type="hidden" name="applicationId" value={app.id} />
                <input name="reason" placeholder="Reason (optional)" className={inputClass} aria-label="Reason for withdrawal" />
                <div className="mt-2">
                  <SubmitButton variant="danger" size="sm">
                    Withdraw
                  </SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
