import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireActorPage } from "@/server/auth/actor";
import { getApplicationDetail } from "@/server/services/applications";
import { can, REVIEW_TRANSITIONS } from "@/server/authz";
import { NotFoundError } from "@/server/errors";
import { getDb, schema } from "@/server/db";
import { Badge, Card, DL, Field, PageHeader, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FindingCard } from "@/components/finding-card";
import { DocumentViewer } from "@/components/document-viewer";
import { PriorityExplainer, RunSummary, StatusTimeline } from "@/components/case-parts";
import {
  addObservationAction,
  caseActionAction,
  manualVerifyAction,
  recordCertificateAction,
  recordDecisionAction,
  reviewFindingAction,
  runValidationAction,
  verifySourceAction,
} from "@/app/actions";
import { STATUS_LABELS, STATUS_TONE, VERIFICATION_STATUSES, VERIFICATION_TONE, type AppStatus, type VerificationStatus } from "@/lib/constants";
import { formatDate, formatINR } from "@/lib/utils";
import { nameSimilarity, normaliseRef } from "@/server/extraction/fields";

export const metadata = { title: "Review workspace" };

const CASE_ACTIONS: { action: keyof typeof REVIEW_TRANSITIONS; label: string; placeholder: string }[] = [
  { action: "START_REVIEW", label: "Start review", placeholder: "Note for the case file" },
  { action: "REQUEST_CLARIFICATION", label: "Request clarification / rectification", placeholder: "What the institution must correct or provide (sent to them)" },
  { action: "MARK_EXTERNAL_PENDING", label: "Mark external verification pending", placeholder: "Which source is being contacted and why" },
  { action: "RECOMMEND_INSPECTION", label: "Recommend physical inspection", placeholder: "Why on-site inspection is needed" },
  { action: "RETURN_TO_REVIEW", label: "Return to review", placeholder: "Outcome of verification / inspection" },
];

export default async function ReviewWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActorPage();
  const { id } = await params;
  if (actor.role === "INSTITUTION") redirect(`/app/applications/${id}`);
  let d;
  try {
    d = await getApplicationDetail(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { app } = d;
  const docTypes = await getDb().select().from(schema.documentTypes);
  const label = (code: string) => docTypes.find((t) => t.code === code)?.label ?? code;
  const activeDocs = d.documents.filter((x) => x.status === "ACTIVE");
  const docName = (docId: string | null) => activeDocs.find((x) => x.id === docId)?.originalName ?? (docId ? "(replaced document)" : null);
  const final = app.status === "APPROVED" || app.status === "REJECTED" || app.status === "WITHDRAWN";
  const allowed = CASE_ACTIONS.filter((a) => (REVIEW_TRANSITIONS[a.action] as string[]).includes(app.status));

  // Discrepancy table: application value vs each document's extracted value.
  const compare = activeDocs.flatMap((doc) =>
    doc.fields
      .filter((f) => f.source === "parser" && (f.field === "institution_name" || f.field === "institution_id"))
      .map((f) => {
        const declared = f.field === "institution_name" ? app.declaredInstitutionName : app.declaredInstitutionRef;
        const match = f.field === "institution_name" ? nameSimilarity(f.value, declared) >= 0.8 : normaliseRef(f.value) === normaliseRef(declared);
        return { doc: doc.originalName, docType: label(doc.docTypeCode), field: f.field === "institution_name" ? "Institution name" : "Institution ID", declared, extracted: f.value, page: f.page, match };
      }),
  );

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/app/queue", label: "Application queue" }, { label: app.refNo }]}
        title={<span className="tabular-nums">{app.refNo}</span>}
        subtitle={`${d.institution.name} (${d.institution.refId}) · ${d.category.name} · ${app.academicYear} · officer: ${d.officerName ?? "unassigned"}`}
        actions={
          <>
            <Badge tone={STATUS_TONE[app.status as AppStatus]} className="px-3 py-1 text-sm">
              {STATUS_LABELS[app.status as AppStatus]}
            </Badge>
            {!final && (
              <ActionForm action={runValidationAction}>
                <input type="hidden" name="applicationId" value={app.id} />
                <SubmitButton variant="secondary" pendingText="Re-validating…">
                  Re-run validation
                </SubmitButton>
              </ActionForm>
            )}
          </>
        }
      />
      <p className="mb-4 rounded-md border border-line bg-white px-3 py-2 text-xs text-muted">
        This workspace keeps four things separate: <strong className="text-ink">machine findings</strong> (rule or AI), <strong className="text-ink">officer reviews</strong> of those findings,{" "}
        <strong className="text-ink">verification records</strong> from a source or manual check, and the <strong className="text-ink">official decision</strong>.
      </p>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="xl:sticky xl:top-20 xl:self-start">
          <DocumentViewer
            docs={activeDocs.map((x) => ({
              id: x.id,
              name: x.originalName,
              typeLabel: label(x.docTypeCode),
              mime: x.mimeType,
              sizeBytes: x.sizeBytes,
              sha256: x.sha256,
              uploadedAt: x.uploadedAt.toISOString(),
              pageCount: Math.max(1, x.pageCount),
              extractionStatus: x.extractionStatus,
              pages: x.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text, method: p.method, ocrConfidence: p.ocrConfidence })),
              highlights: compare.filter((c) => c.doc === x.originalName && !c.match).map((c) => c.extracted),
            }))}
          />
        </div>

        <div className="space-y-6">
          <Card title="Application summary">
            <DL
              items={[
                ["Declared institution", app.declaredInstitutionName],
                ["Declared reference", app.declaredInstitutionRef],
                ["Institution record (synthetic)", `${d.institution.name} · ${d.institution.refId}`],
                ["Programme", app.programmeName],
                ["Intake (approved → proposed)", app.approvedIntake !== null || app.proposedIntake !== null ? `${app.approvedIntake ?? "—"} → ${app.proposedIntake ?? "—"}` : ""],
                ["Payment", app.paymentReference ? `${app.paymentReference} · ${formatINR(app.paymentAmount)}` : ""],
                ["Submitted", formatDate(app.submittedAt, true)],
                ["Contact", `${app.contactName} ${app.contactEmail}`],
              ]}
            />
            <div className="mt-4 border-t border-line pt-4">
              <PriorityExplainer level={app.reviewPriority} score={app.priorityScore} factors={app.priorityFactors} />
            </div>
          </Card>

          {compare.length > 0 && (
            <Card title="Application vs documents" description="Values read from each document compared with what the application declares.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="pb-2 pr-3 font-medium">Document</th>
                      <th className="pb-2 pr-3 font-medium">Field</th>
                      <th className="pb-2 pr-3 font-medium">Extracted</th>
                      <th className="pb-2 font-medium">Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {compare.map((c, i) => (
                      <tr key={i} className={c.match ? "" : "bg-bad-bg/40"}>
                        <td className="py-1.5 pr-3">{c.docType}</td>
                        <td className="py-1.5 pr-3">{c.field}</td>
                        <td className="py-1.5 pr-3 break-words">
                          {c.extracted}
                          {c.page ? <span className="ml-1 text-xs text-muted">p.{c.page}</span> : null}
                        </td>
                        <td className="py-1.5">{c.match ? <Badge tone="success">Matches</Badge> : <Badge tone="danger">Differs from “{c.declared}”</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card title="Checklist and document verification" description="Source checks use the configured adapter. Demo sources are synthetic — no issuing authority is contacted.">
            <ul className="space-y-3">
              {d.checklist.map((c) => {
                const docs = activeDocs.filter((x) => x.docTypeCode === c.docTypeCode);
                return (
                  <li key={c.docTypeCode} className="rounded-md border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{c.label}</span>
                      {c.mandatory ? <Badge tone="danger">Mandatory</Badge> : <Badge>Optional</Badge>}
                      {docs.length === 0 && <Badge tone={c.mandatory ? "danger" : "neutral"}>Not supplied</Badge>}
                    </div>
                    {docs.map((x) => (
                      <div key={x.id} className="mt-2 rounded bg-paper p-2.5 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-all">{x.originalName}</span>
                          <Badge tone={VERIFICATION_TONE[x.verificationStatus as VerificationStatus]}>{VERIFICATION_STATUSES[x.verificationStatus as VerificationStatus] ?? x.verificationStatus}</Badge>
                        </div>
                        {x.verifications.length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs text-muted">
                            {x.verifications.map((v) => (
                              <li key={v.id}>
                                {formatDate(v.createdAt, true)} · <span className="text-ink">{v.sourceName}</span> ({v.sourceType.replaceAll("_", " ").toLowerCase()}) · {v.method} →{" "}
                                <span className="font-medium text-ink">{VERIFICATION_STATUSES[v.result as VerificationStatus] ?? v.result}</span> · by {v.initiatedBy}
                                {v.notes ? ` — ${v.notes}` : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                        {!final && can(actor, "verification.run") && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <ActionForm action={verifySourceAction}>
                              <input type="hidden" name="documentId" value={x.id} />
                              <input type="hidden" name="applicationId" value={app.id} />
                              <SubmitButton size="sm" variant="secondary" pendingText="Checking…">
                                Check configured source
                              </SubmitButton>
                            </ActionForm>
                            <details className="w-full">
                              <summary className="cursor-pointer text-xs font-medium text-action">Record manual verification</summary>
                              <ActionForm action={manualVerifyAction} className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
                                <input type="hidden" name="documentId" value={x.id} />
                                <input type="hidden" name="applicationId" value={app.id} />
                                <select name="result" aria-label="Manual verification result" className={inputClass}>
                                  <option value="MANUALLY_VERIFIED">Verified manually</option>
                                  <option value="MISMATCH_DETECTED">Mismatch detected</option>
                                  <option value="EXPIRED">Expired</option>
                                  <option value="MANUAL_REVIEW_REQUIRED">Needs further review</option>
                                  <option value="UNABLE_TO_DETERMINE">Unable to determine</option>
                                </select>
                                <input name="notes" placeholder="What was checked, against what" aria-label="Verification notes" className={inputClass} />
                                <SubmitButton size="sm">Record</SubmitButton>
                              </ActionForm>
                            </details>
                          </div>
                        )}
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Validation run">{d.latestRun ? <RunSummary run={d.latestRun} /> : <p className="text-sm text-muted">No validation run recorded.</p>}</Card>

          <section>
            <h2 className="mb-3 text-[15px] font-semibold">Findings ({d.findings.length})</h2>
            <div className="space-y-3">
              {d.findings.map((f) => (
                <FindingCard key={f.id} f={f} documentName={docName(f.documentId)} anchor>
                  {!final && can(actor, "review.record") && (
                    <ActionForm action={reviewFindingAction} className="grid gap-2 sm:grid-cols-[220px_1fr_auto]">
                      <input type="hidden" name="findingId" value={f.id} />
                      <input type="hidden" name="applicationId" value={app.id} />
                      <select name="status" aria-label={`Review outcome for ${f.refNo}`} className={inputClass} defaultValue={f.reviewStatus === "OPEN" ? "CONFIRMED" : f.reviewStatus}>
                        <option value="CONFIRMED">Confirm deficiency</option>
                        <option value="DISMISSED">Dismiss finding</option>
                        <option value="ADDITIONAL_EVIDENCE">Additional evidence required</option>
                        <option value="EXTERNAL_PENDING">External verification pending</option>
                        <option value="MANUALLY_VERIFIED">Manual verification completed</option>
                      </select>
                      <input name="reason" required minLength={5} placeholder="Reason / evidence considered" aria-label={`Reason for ${f.refNo}`} className={inputClass} />
                      <SubmitButton size="sm">{f.reviewStatus === "OPEN" ? "Record review" : "Update review"}</SubmitButton>
                    </ActionForm>
                  )}
                </FindingCard>
              ))}
            </div>
          </section>

          {!final && allowed.length > 0 && can(actor, "review.updateCaseStatus") && (
            <Card title="Case actions" description="Moves the case through the scrutiny workflow. Each action is recorded with your reason.">
              <ActionForm action={caseActionAction} className="space-y-3">
                <input type="hidden" name="applicationId" value={app.id} />
                <Field label="Action" htmlFor="case-action">
                  <select id="case-action" name="action" className={inputClass}>
                    {allowed.map((a) => (
                      <option key={a.action} value={a.action}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Reason" htmlFor="case-reason" hint="For clarification requests this text is sent to the institution.">
                  <textarea id="case-reason" name="reason" rows={3} className={inputClass} />
                </Field>
                <SubmitButton>Apply action</SubmitButton>
              </ActionForm>
            </Card>
          )}

          {can(actor, "decision.record") && (REVIEW_TRANSITIONS.RECORD_DECISION as string[]).includes(app.status) && (
            <Card title="Record official decision" description="Only an authorized user can record this. The AI layer never approves or rejects." className="border-navy-700/30">
              <ActionForm action={recordDecisionAction} className="space-y-3" confirm="Record this official decision? It will be visible to the institution and cannot be edited.">
                <input type="hidden" name="applicationId" value={app.id} />
                <Field label="Decision" htmlFor="decision">
                  <select id="decision" name="decision" className={inputClass}>
                    <option value="APPROVED">Approve</option>
                    <option value="REJECTED">Reject</option>
                  </select>
                </Field>
                <Field label="Basis for the decision" htmlFor="decision-reason">
                  <textarea id="decision-reason" name="reason" rows={3} className={inputClass} />
                </Field>
                <SubmitButton>Record decision</SubmitButton>
              </ActionForm>
            </Card>
          )}

          {(d.decisions.length > 0 || d.certificates.length > 0) && (
            <Card title="Official decision and certificate records">
              {d.decisions.map((x) => (
                <p key={x.id} className="text-sm">
                  <span className="font-medium">{x.decision === "APPROVED" ? "Approved" : "Rejected"}</span> by {x.by} on {formatDate(x.createdAt, true)} — <span className="text-muted">{x.reason}</span>
                </p>
              ))}
              {d.certificates.map((c) => (
                <p key={c.id} className="mt-2 text-sm">
                  <Link href={`/app/certificates/${c.id}`} className="text-action hover:underline">
                    {c.certificateRef}
                  </Link>{" "}
                  <span className="text-muted">— demo record, not an official AICTE certificate</span>
                </p>
              ))}
              {app.status === "APPROVED" && d.certificates.length === 0 && can(actor, "certificate.record") && (
                <ActionForm action={recordCertificateAction} className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <input name="issuingAuthority" defaultValue="AICTE (DEMO — not an official certificate)" aria-label="Issuing authority" className={`${inputClass} max-w-sm`} />
                  <SubmitButton size="sm">Create demo certificate record</SubmitButton>
                </ActionForm>
              )}
            </Card>
          )}

          <Card title="Officer observations and rectification requests">
            {!final && (
              <ActionForm action={addObservationAction} resetOnSuccess className="mb-4 flex gap-2">
                <input type="hidden" name="applicationId" value={app.id} />
                <input name="text" placeholder="Add an internal observation" aria-label="Observation" className={inputClass} />
                <SubmitButton size="sm">Add</SubmitButton>
              </ActionForm>
            )}
            <ul className="space-y-2 text-sm">
              {d.rectifications.map((r) => (
                <li key={r.id} className="rounded-md bg-warn-bg/60 p-2.5">
                  <div className="text-xs text-muted">
                    Rectification request · {formatDate(r.createdAt, true)} · {r.status.toLowerCase()}
                  </div>
                  <p>{r.message}</p>
                  {r.response && <p className="mt-1 text-ink">Institution response: {r.response}</p>}
                </li>
              ))}
              {d.observations.map((o) => (
                <li key={o.id} className="border-b border-line pb-2">
                  <div className="text-xs text-muted">
                    {o.reviewer} · {o.action.replaceAll("_", " ").toLowerCase()} · {formatDate(o.createdAt, true)}
                  </div>
                  <p>{o.reason}</p>
                </li>
              ))}
              {d.rectifications.length === 0 && d.observations.length === 0 && <li className="text-muted">Nothing recorded yet.</li>}
            </ul>
          </Card>

          <Card title="Case history">
            <StatusTimeline history={d.history} />
            {d.runs.length > 1 && (
              <p className="mt-3 text-xs text-muted">
                {d.runs.length} validation runs on record (rulesets: {[...new Set(d.runs.map((r) => r.rulesetVersion))].join(", ")}).
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
