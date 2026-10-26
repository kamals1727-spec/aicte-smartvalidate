// Server-side authorization. Every service function calls into this module.
// Checks, in order: authenticated → role permits action → actor may access this
// specific institution/application → action allowed in the current workflow state.
import type { AppStatus, Role } from "@/lib/constants";
import { INSTITUTION_EDITABLE, QUEUE_STATUSES } from "@/lib/constants";
import { ForbiddenError, NotFoundError, WorkflowError } from "./errors";

export interface Actor {
  id: string;
  name: string;
  email: string;
  role: Role;
  institutionId: string | null;
}

export const PERMISSIONS = {
  "application.create": ["INSTITUTION"],
  "application.edit": ["INSTITUTION"],
  "application.submit": ["INSTITUTION"],
  "application.validate": ["INSTITUTION", "OFFICER", "ADMIN"],
  "document.upload": ["INSTITUTION"],
  "queue.view": ["OFFICER", "ADMIN"],
  "review.record": ["OFFICER", "ADMIN"],
  "review.requestRectification": ["OFFICER", "ADMIN"],
  "review.updateCaseStatus": ["OFFICER", "ADMIN"],
  "verification.run": ["OFFICER", "ADMIN"],
  "decision.record": ["ADMIN"],
  "certificate.record": ["ADMIN"],
  "application.assign": ["ADMIN"],
  "alert.manage": ["OFFICER", "ADMIN"],
  "institution.viewAll": ["OFFICER", "ADMIN"],
  "admin.users": ["ADMIN"],
  "admin.rules": ["ADMIN"],
  "admin.categories": ["ADMIN"],
  "audit.view": ["ADMIN"],
  "health.view": ["ADMIN", "OFFICER"],
  "health.testAi": ["ADMIN"],
  "payments.viewAll": ["OFFICER", "ADMIN"],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;

export function can(actor: Actor, perm: Permission): boolean {
  return (PERMISSIONS[perm] as readonly Role[]).includes(actor.role);
}

export function assertCan(actor: Actor, perm: Permission): void {
  if (!can(actor, perm)) throw new ForbiddenError();
}

interface AppLike {
  institutionId: string;
  status: string;
  assignedOfficerId: string | null;
}

/** Can this actor see this application at all? */
export function canViewApplication(actor: Actor, app: AppLike): boolean {
  switch (actor.role) {
    case "ADMIN":
      return true;
    case "INSTITUTION":
      return actor.institutionId !== null && app.institutionId === actor.institutionId;
    case "OFFICER":
      return (
        (QUEUE_STATUSES as string[]).includes(app.status) &&
        (app.assignedOfficerId === null || app.assignedOfficerId === actor.id)
      );
    default:
      return false;
  }
}

/** Throws NotFound (not Forbidden) so that IDs of other institutions' records can't be probed. */
export function assertViewApplication(actor: Actor, app: AppLike | undefined | null): asserts app is AppLike {
  if (!app || !canViewApplication(actor, app)) throw new NotFoundError("Application not found.");
}

export function assertInstitutionEditable(app: { status: string }) {
  if (!(INSTITUTION_EDITABLE as string[]).includes(app.status)) {
    throw new WorkflowError(
      `This application is "${app.status.replaceAll("_", " ").toLowerCase()}" and can no longer be edited by the institution.`,
    );
  }
}

export function canViewInstitution(actor: Actor, institutionId: string): boolean {
  if (actor.role === "INSTITUTION") return actor.institutionId === institutionId;
  return true;
}

// ── Workflow state machine for official review actions ──
export const REVIEW_TRANSITIONS: Record<string, AppStatus[]> = {
  START_REVIEW: ["SUBMITTED"],
  REQUEST_CLARIFICATION: ["SUBMITTED", "UNDER_REVIEW", "PENDING_EXTERNAL_VERIFICATION", "INSPECTION_RECOMMENDED"],
  MARK_EXTERNAL_PENDING: ["SUBMITTED", "UNDER_REVIEW"],
  RECOMMEND_INSPECTION: ["SUBMITTED", "UNDER_REVIEW", "PENDING_EXTERNAL_VERIFICATION"],
  RETURN_TO_REVIEW: ["PENDING_EXTERNAL_VERIFICATION", "INSPECTION_RECOMMENDED"],
  RECORD_DECISION: ["UNDER_REVIEW", "PENDING_EXTERNAL_VERIFICATION", "INSPECTION_RECOMMENDED"],
};

export function assertTransition(action: keyof typeof REVIEW_TRANSITIONS, status: string) {
  if (!(REVIEW_TRANSITIONS[action] as string[]).includes(status)) {
    throw new WorkflowError(`Action not allowed while the application is ${status.replaceAll("_", " ").toLowerCase()}.`);
  }
}
