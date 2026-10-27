"use server";
// Server actions. Each one: authenticate from the cookie (never trusting client-sent roles)
// → call a service (which enforces role, resource and workflow-state authorization)
// → revalidate. Errors are returned as safe messages, never stack traces.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireActor, getActor } from "@/server/auth/actor";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/server/auth/session";
import { AppError, toSafeMessage } from "@/server/errors";
import { login, recordLogout, register } from "@/server/services/auth";
import * as apps from "@/server/services/applications";
import { removeDocument } from "@/server/services/documents";
import { runValidation } from "@/server/services/validation";
import * as review from "@/server/services/review";
import { alertAction } from "@/server/services/alerts";
import * as admin from "@/server/services/admin";
import { testAiConnection } from "@/server/ai/service";
import { newCorrelationId } from "@/server/audit";
import { assertCan } from "@/server/authz";

export interface ActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

function fail(err: unknown): ActionResult {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of err.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, message: err.issues[0]?.message ?? "Check the highlighted fields.", fieldErrors };
  }
  if (!(err instanceof AppError)) console.error("[action error]", err instanceof Error ? err.message : "unknown");
  return { ok: false, message: toSafeMessage(err) };
}

function form(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}

// ── Auth ──

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { token } = await login({ email: fd.get("email"), password: fd.get("password") }, await clientIp());
    await setSessionCookie(token);
  } catch (err) {
    return fail(err);
  }
  redirect("/app");
}

export async function registerAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { token } = await register(form(fd), await clientIp());
    await setSessionCookie(token);
  } catch (err) {
    return fail(err);
  }
  redirect("/app");
}

export async function logoutAction() {
  const actor = await getActor();
  if (actor) await recordLogout(actor);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ── Institution: applications ──

export async function createApplicationAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const actor = await requireActor();
    const app = await apps.createApplication(actor, form(fd));
    id = app.id;
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/app");
  redirect(`/app/applications/${id}?created=1`);
}

export async function updateApplicationAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const id = String(fd.get("applicationId"));
    await apps.updateApplication(actor, id, form(fd));
    revalidatePath(`/app/applications/${id}`);
    return { ok: true, message: "Application details saved. Re-run validation to check them." };
  } catch (err) {
    return fail(err);
  }
}

export async function runValidationAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const id = String(fd.get("applicationId"));
    const r = await runValidation(actor, id);
    revalidatePath(`/app/applications/${id}`);
    revalidatePath(`/app/review/${id}`);
    const mode = r.aiMode === "LIVE" ? "with live AI" : r.aiMode === "DEGRADED" ? "— AI unavailable, demo explanations used" : "in DEMO mode (simulated AI)";
    return { ok: true, message: `Validation completed ${mode}: ${r.findings} finding(s), ${r.criticalCount} critical, ${(r.durationMs / 1000).toFixed(1)}s.` };
  } catch (err) {
    return fail(err);
  }
}

export async function submitApplicationAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const id = String(fd.get("applicationId"));
    await apps.submitApplication(actor, id, fd.get("declaration") === "on");
    revalidatePath(`/app/applications/${id}`);
    return { ok: true, message: "Application submitted for official scrutiny." };
  } catch (err) {
    return fail(err);
  }
}

export async function removeDocumentAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await removeDocument(actor, String(fd.get("documentId")));
    revalidatePath(`/app/applications/${fd.get("applicationId")}`);
    return { ok: true, message: "Document removed. Re-run validation." };
  } catch (err) {
    return fail(err);
  }
}

export async function respondRectificationAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await apps.respondToRectification(actor, String(fd.get("rectificationId")), String(fd.get("response") ?? ""));
    revalidatePath(`/app/applications/${fd.get("applicationId")}`);
    return { ok: true, message: "Response recorded. Upload any requested documents, re-validate and resubmit." };
  } catch (err) {
    return fail(err);
  }
}

export async function withdrawApplicationAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const id = String(fd.get("applicationId"));
    await apps.withdrawApplication(actor, id, String(fd.get("reason") ?? ""));
    revalidatePath(`/app/applications/${id}`);
    return { ok: true, message: "Application withdrawn." };
  } catch (err) {
    return fail(err);
  }
}

// ── Officer / admin: review ──

export async function reviewFindingAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await review.reviewFinding(actor, form(fd));
    revalidatePath(`/app/review/${fd.get("applicationId")}`);
    return { ok: true, message: "Review recorded." };
  } catch (err) {
    return fail(err);
  }
}

export async function addObservationAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const id = String(fd.get("applicationId"));
    await review.addObservation(actor, id, String(fd.get("text") ?? ""));
    revalidatePath(`/app/review/${id}`);
    return { ok: true, message: "Observation added." };
  } catch (err) {
    return fail(err);
  }
}

export async function caseActionAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const id = String(fd.get("applicationId"));
    await review.caseAction(actor, id, { action: fd.get("action"), reason: fd.get("reason") });
    revalidatePath(`/app/review/${id}`);
    revalidatePath("/app/queue");
    return { ok: true, message: "Case status updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function recordDecisionAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const id = String(fd.get("applicationId"));
    await review.recordDecision(actor, id, { decision: fd.get("decision"), reason: fd.get("reason") });
    revalidatePath(`/app/review/${id}`);
    return { ok: true, message: "Official decision recorded." };
  } catch (err) {
    return fail(err);
  }
}

export async function recordCertificateAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const id = String(fd.get("applicationId"));
    const ref = await review.recordCertificate(actor, id, { issuingAuthority: fd.get("issuingAuthority") });
    revalidatePath(`/app/review/${id}`);
    return { ok: true, message: `Demo certificate record ${ref} created.` };
  } catch (err) {
    return fail(err);
  }
}

export async function assignAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const ids = fd.getAll("applicationIds").map(String).filter(Boolean);
    const officer = String(fd.get("officerId") ?? "");
    await review.assignApplications(actor, ids, officer === "unassigned" || officer === "" ? null : officer);
    revalidatePath("/app/queue");
    return { ok: true, message: `${ids.length} application(s) assigned.` };
  } catch (err) {
    return fail(err);
  }
}

export async function verifySourceAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const r = await review.runSourceVerification(actor, String(fd.get("documentId")));
    revalidatePath(`/app/review/${fd.get("applicationId")}`);
    return { ok: true, message: `Source check: ${r.result.replaceAll("_", " ").toLowerCase()}. ${r.notes}` };
  } catch (err) {
    return fail(err);
  }
}

export async function manualVerifyAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await review.recordManualVerification(actor, String(fd.get("documentId")), { result: fd.get("result"), notes: fd.get("notes") });
    revalidatePath(`/app/review/${fd.get("applicationId")}`);
    return { ok: true, message: "Manual verification recorded." };
  } catch (err) {
    return fail(err);
  }
}

export async function alertActionAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await alertAction(actor, form(fd));
    revalidatePath("/app/alerts");
    return { ok: true, message: "Alert updated." };
  } catch (err) {
    return fail(err);
  }
}

// ── Admin ──

export async function createUserAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await admin.createUser(actor, form(fd));
    revalidatePath("/app/admin/users");
    return { ok: true, message: "User created." };
  } catch (err) {
    return fail(err);
  }
}

export async function toggleUserAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await admin.setUserActive(actor, String(fd.get("userId")), fd.get("active") === "true");
    revalidatePath("/app/admin/users");
    return { ok: true, message: "User updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function setRoleAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const inst = String(fd.get("institutionId") ?? "");
    await admin.setUserRole(actor, String(fd.get("userId")), String(fd.get("role")), inst || null);
    revalidatePath("/app/admin/users");
    return { ok: true, message: "Role updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function toggleCategoryAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await admin.setCategoryActive(actor, String(fd.get("categoryId")), fd.get("active") === "true");
    revalidatePath("/app/admin/categories");
    return { ok: true, message: "Category updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function setChecklistAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await admin.setChecklistItem(actor, String(fd.get("categoryId")), String(fd.get("docTypeCode")), String(fd.get("state")) as "mandatory" | "optional" | "remove");
    revalidatePath("/app/admin/categories");
    return { ok: true, message: "Checklist updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function updateRuleAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const v = await admin.updateRule(actor, {
      ruleId: fd.get("ruleId"),
      severity: fd.get("severity"),
      active: fd.get("active") === "on",
      categories: fd.get("categories"),
      params: fd.get("params"),
      note: fd.get("note"),
    });
    revalidatePath("/app/admin/rules");
    return { ok: true, message: `Rule updated — ruleset ${v} is now active. Earlier validation runs keep their original version.` };
  } catch (err) {
    return fail(err);
  }
}

export async function testAiAction(_: ActionResult | null): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    assertCan(actor, "health.testAi");
    const r = await testAiConnection(newCorrelationId());
    revalidatePath("/app/health");
    return { ok: r.ok, message: r.message };
  } catch (err) {
    return fail(err);
  }
}
