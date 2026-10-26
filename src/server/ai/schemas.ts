// Zod schemas (validation) + matching JSON Schemas (sent to the model as the response format).
// Model output is NEVER saved unless it passes these schemas.
import { z } from "zod";

export const OBSERVATION_CATEGORIES = [
  "content_mismatch",
  "cross_document_mismatch",
  "date_inconsistency",
  "missing_information",
  "possible_alteration_indicator",
  "document_type_mismatch",
  "other",
] as const;

const str = (max: number) => z.string().trim().min(1).transform((s) => s.slice(0, max));

export const DocumentAnalysisSchema = z.object({
  document_type: str(80),
  matches_declared_type: z.enum(["yes", "no", "unclear"]),
  extracted_fields: z
    .array(
      z.object({
        field: str(60),
        value: str(200),
        page: z.number().int().min(0).max(1000),
        evidence: z.string().transform((s) => s.slice(0, 240)),
      }),
    )
    .transform((a) => a.slice(0, 15)),
  observations: z
    .array(
      z.object({
        category: z.enum(OBSERVATION_CATEGORIES),
        description: str(500),
        evidence: z.string().transform((s) => s.slice(0, 300)),
        recommended_action: str(300),
      }),
    )
    .transform((a) => a.slice(0, 5)),
  limitations: z.array(z.string().transform((s) => s.slice(0, 300))).transform((a) => a.slice(0, 5)),
});
export type DocumentAnalysis = z.infer<typeof DocumentAnalysisSchema>;

export const FindingsSummarySchema = z.object({
  summary: str(1200),
  finding_explanations: z
    .array(z.object({ finding_ref: str(40), explanation: str(600) }))
    .transform((a) => a.slice(0, 60)),
  reviewer_recommendations: z.array(str(300)).transform((a) => a.slice(0, 6)),
  limitations: z.array(z.string().transform((s) => s.slice(0, 300))).transform((a) => a.slice(0, 5)),
});
export type FindingsSummary = z.infer<typeof FindingsSummarySchema>;

// JSON Schemas kept deliberately simple (no nulls / unions) so both providers accept them.
const s = { type: "string" } as const;
export const DocumentAnalysisJsonSchema = {
  type: "object",
  properties: {
    document_type: s,
    matches_declared_type: { type: "string", enum: ["yes", "no", "unclear"] },
    extracted_fields: {
      type: "array",
      items: {
        type: "object",
        properties: { field: s, value: s, page: { type: "integer" }, evidence: s },
        required: ["field", "value", "page", "evidence"],
      },
    },
    observations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: [...OBSERVATION_CATEGORIES] },
          description: s,
          evidence: s,
          recommended_action: s,
        },
        required: ["category", "description", "evidence", "recommended_action"],
      },
    },
    limitations: { type: "array", items: s },
  },
  required: ["document_type", "matches_declared_type", "extracted_fields", "observations", "limitations"],
} as const;

export const FindingsSummaryJsonSchema = {
  type: "object",
  properties: {
    summary: s,
    finding_explanations: {
      type: "array",
      items: {
        type: "object",
        properties: { finding_ref: s, explanation: s },
        required: ["finding_ref", "explanation"],
      },
    },
    reviewer_recommendations: { type: "array", items: s },
    limitations: { type: "array", items: s },
  },
  required: ["summary", "finding_explanations", "reviewer_recommendations", "limitations"],
} as const;

/** Anthropic structured outputs require additionalProperties:false on every object. */
export function strictify(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictify);
  if (schema && typeof schema === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) o[k] = strictify(v);
    if (o.type === "object") o.additionalProperties = false;
    return o;
  }
  return schema;
}
