import bcrypt from "bcryptjs";
import { and, asc, desc, eq, like, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { audit, newCorrelationId } from "../audit";
import { assertCan, type Actor } from "../authz";
import { AppError, NotFoundError } from "../errors";
import { ROLES, SEVERITIES } from "@/lib/constants";

// ── Users ──

export async function listUsers(actor: Actor) {
  assertCan(actor, "admin.users");
  return getDb()
    .select({ u: schema.users, institution: schema.institutions.name })
    .from(schema.users)
    .leftJoin(schema.institutions, eq(schema.institutions.id, schema.users.institutionId))
    .orderBy(asc(schema.users.role), asc(schema.users.name));
}

const NewUser = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ROLES),
  institutionId: z.string().optional(),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
});

export async function createUser(actor: Actor, raw: unknown) {
  assertCan(actor, "admin.users");
  const input = NewUser.parse(raw);
  if (input.role === "INSTITUTION" && !input.institutionId) throw new AppError("Institution users must be linked to an institution.");
  const db = getDb();
  const [exists] = await db.select().from(schema.users).where(eq(schema.users.email, input.email));
  if (exists) throw new AppError("A user with this email already exists.");
  const [u] = await db
    .insert(schema.users)
    .values({ name: input.name, email: input.email, role: input.role, institutionId: input.role === "INSTITUTION" ? input.institutionId : null, passwordHash: await bcrypt.hash(input.password, 10) })
    .returning();
  await audit(db, { actor, action: "user.created", entityType: "user", entityId: u.id, entityRef: u.email, newState: u.role });
}

export async function setUserActive(actor: Actor, userId: string, active: boolean) {
  assertCan(actor, "admin.users");
  if (userId === actor.id && !active) throw new AppError("You cannot deactivate your own account.");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) throw new NotFoundError();
  await db.update(schema.users).set({ active }).where(eq(schema.users.id, userId));
  await audit(db, { actor, action: active ? "user.activated" : "user.deactivated", entityType: "user", entityId: u.id, entityRef: u.email, previousState: String(u.active), newState: String(active) });
}

export async function setUserRole(actor: Actor, userId: string, role: string, institutionId: string | null) {
  assertCan(actor, "admin.users");
  const r = z.enum(ROLES).parse(role);
  if (userId === actor.id) throw new AppError("You cannot change your own role.");
  if (r === "INSTITUTION" && !institutionId) throw new AppError("Institution users must be linked to an institution.");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) throw new NotFoundError();
  await db.update(schema.users).set({ role: r, institutionId: r === "INSTITUTION" ? institutionId : null }).where(eq(schema.users.id, userId));
  await audit(db, { actor, action: "user.role_changed", entityType: "user", entityId: u.id, entityRef: u.email, previousState: u.role, newState: r });
}

// ── Categories & checklists ──

export async function listCategoriesAdmin(actor: Actor) {
  assertCan(actor, "admin.categories");
  const db = getDb();
  const cats = await db.select().from(schema.categories).orderBy(asc(schema.categories.name));
  const items = await db
    .select({ ci: schema.checklistItems, label: schema.documentTypes.label })
    .from(schema.checklistItems)
    .innerJoin(schema.documentTypes, eq(schema.documentTypes.code, schema.checklistItems.docTypeCode))
    .orderBy(asc(schema.checklistItems.sortOrder));
  const docTypes = await db.select().from(schema.documentTypes).orderBy(asc(schema.documentTypes.label));
  return { categories: cats.map((c) => ({ ...c, items: items.filter((i) => i.ci.categoryId === c.id).map((i) => ({ ...i.ci, label: i.label })) })), docTypes };
}

export async function setCategoryActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "admin.categories");
  const db = getDb();
  const [c] = await db.select().from(schema.categories).where(eq(schema.categories.id, id));
  if (!c) throw new NotFoundError();
  await db.update(schema.categories).set({ active }).where(eq(schema.categories.id, id));
  await audit(db, { actor, action: "category.updated", entityType: "category", entityId: id, entityRef: c.code, previousState: `active=${c.active}`, newState: `active=${active}` });
}

export async function setChecklistItem(actor: Actor, categoryId: string, docTypeCode: string, state: "mandatory" | "optional" | "remove") {
  assertCan(actor, "admin.categories");
  const db = getDb();
  const [c] = await db.select().from(schema.categories).where(eq(schema.categories.id, categoryId));
  const [dt] = await db.select().from(schema.documentTypes).where(eq(schema.documentTypes.code, docTypeCode));
  if (!c || !dt) throw new NotFoundError();
  const [existing] = await db.select().from(schema.checklistItems).where(and(eq(schema.checklistItems.categoryId, categoryId), eq(schema.checklistItems.docTypeCode, docTypeCode)));
  if (state === "remove") {
    if (existing) await db.delete(schema.checklistItems).where(eq(schema.checklistItems.id, existing.id));
  } else if (existing) {
    await db.update(schema.checklistItems).set({ mandatory: state === "mandatory" }).where(eq(schema.checklistItems.id, existing.id));
  } else {
    await db.insert(schema.checklistItems).values({ categoryId, docTypeCode, mandatory: state === "mandatory", sortOrder: 99 });
  }
  await audit(db, { actor, action: "checklist.updated", entityType: "category", entityId: categoryId, entityRef: c.code, previousState: existing ? (existing.mandatory ? "mandatory" : "optional") : "absent", newState: state, metadata: { docType: docTypeCode } });
}

// ── Rules (versioned) ──

export async function getActiveRuleset(actor: Actor) {
  assertCan(actor, "admin.rules");
  const db = getDb();
  const versions = await db.select().from(schema.rulesetVersions).orderBy(desc(schema.rulesetVersions.createdAt));
  const active = versions.find((v) => v.active);
  const rules = active
    ? await db.select().from(schema.validationRules).where(eq(schema.validationRules.rulesetVersionId, active.id)).orderBy(asc(schema.validationRules.ruleCode))
    : [];
  return { versions, active, rules };
}

const RuleChange = z.object({
  ruleId: z.string(),
  severity: z.enum(SEVERITIES),
  active: z.boolean(),
  categories: z.string().trim().max(300).regex(/^(\*|[A-Z_]+(,[A-Z_]+)*)$/, "Use * or comma-separated category codes"),
  params: z.string().max(2000).refine((s) => {
    try {
      return typeof JSON.parse(s) === "object";
    } catch {
      return false;
    }
  }, "Parameters must be a valid JSON object"),
  note: z.string().trim().min(5, "Explain the change (5+ characters)").max(300),
});

/**
 * Rule edits never mutate a ruleset that past validation runs reference: the active
 * version is cloned into a new version containing the change, and the new version is
 * activated. Old runs keep pointing at the exact rules that produced their findings.
 */
export async function updateRule(actor: Actor, raw: unknown) {
  assertCan(actor, "admin.rules");
  const input = RuleChange.parse(raw);
  const db = getDb();
  const [rule] = await db.select().from(schema.validationRules).where(eq(schema.validationRules.id, input.ruleId));
  if (!rule) throw new NotFoundError();
  const [current] = await db.select().from(schema.rulesetVersions).where(eq(schema.rulesetVersions.id, rule.rulesetVersionId));
  if (!current?.active) throw new AppError("Only rules in the active ruleset can be changed.");
  const all = await db.select().from(schema.rulesetVersions);
  const nextVersion = `${current.version.replace(/\.\d+$/, "")}.${all.length + 1}`;
  const correlationId = newCorrelationId();
  const [nv] = await db.insert(schema.rulesetVersions).values({ version: nextVersion, active: false, notes: `${input.note} (changed ${rule.ruleCode}; cloned from ${current.version})` }).returning();
  const rules = await db.select().from(schema.validationRules).where(eq(schema.validationRules.rulesetVersionId, current.id));
  await db.insert(schema.validationRules).values(
    rules.map(({ id: _id, rulesetVersionId: _v, updatedAt: _u, ...r }) =>
      r.ruleCode === rule.ruleCode
        ? { ...r, rulesetVersionId: nv.id, severity: input.severity, active: input.active, categories: input.categories, params: input.params, effectiveDate: new Date() }
        : { ...r, rulesetVersionId: nv.id },
    ),
  );
  await db.update(schema.rulesetVersions).set({ active: false }).where(eq(schema.rulesetVersions.id, current.id));
  await db.update(schema.rulesetVersions).set({ active: true }).where(eq(schema.rulesetVersions.id, nv.id));
  await audit(db, {
    actor,
    action: "rule.changed",
    entityType: "validation_rule",
    entityId: rule.id,
    entityRef: rule.ruleCode,
    previousState: JSON.stringify({ severity: rule.severity, active: rule.active, categories: rule.categories, params: rule.params, version: current.version }),
    newState: JSON.stringify({ severity: input.severity, active: input.active, categories: input.categories, params: input.params, version: nextVersion }),
    reason: input.note,
    correlationId,
  });
  return nextVersion;
}

// ── Audit log ──

export async function listAudit(actor: Actor, raw: unknown) {
  assertCan(actor, "audit.view");
  const f = z.object({ q: z.string().optional(), entity: z.string().optional(), page: z.coerce.number().int().min(1).default(1) }).parse(raw);
  const where: SQL[] = [];
  if (f.entity) where.push(eq(schema.auditLogs.entityType, f.entity));
  if (f.q) where.push(or(like(schema.auditLogs.action, `%${f.q}%`), like(schema.auditLogs.entityRef, `%${f.q}%`), like(schema.auditLogs.actorLabel, `%${f.q}%`))!);
  const pageSize = 25;
  const rows = await getDb()
    .select()
    .from(schema.auditLogs)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(pageSize + 1)
    .offset((f.page - 1) * pageSize);
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize, page: f.page };
}
