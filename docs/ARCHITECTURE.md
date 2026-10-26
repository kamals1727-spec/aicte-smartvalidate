# Architecture

## Layers

```
Browser (React client components: forms, uploader, viewer, charts)
   │  server actions (src/app/actions.ts)      route handlers (src/app/api/**)
   ▼
Auth  src/server/auth/      session cookie (jose HS256) → user row from DB (role never trusted from client)
   ▼
Services  src/server/services/   applications · documents · validation · review · alerts · dashboard
   │                             institutions · payments · admin · health · auth
   │   every function takes an Actor and calls src/server/authz.ts:
   │   authenticated → role permits → may access this institution/application → workflow state allows
   ├── extraction/   unpdf (pdf.js) text layer · tesseract.js OCR · PNG encoder · field parser
   ├── validation/   engine.ts — PURE deterministic rule engine + review-priority score
   ├── ai/           config · client (only place keys are read) · service (cache, Zod, retries, fallback) · mock · prompts · schemas
   ├── verification/ adapter interface · synthetic demo registry · "not configured" adapter
   ├── storage.ts    local private folder | database blobs
   └── audit.ts      append-only audit writes
   ▼
DB  Drizzle ORM → libSQL client → SQLite file (local) or Turso (hosted). Migrations in drizzle/.
```

## Validation run (src/server/services/validation.ts)

1. Load the **active ruleset version** and its active rules, the category checklist, active documents, page text and parser-extracted fields, ledger entry, and hashes used by other institutions (existence only).
2. `runRules()` — deterministic findings. Each carries rule id/code, severity from the rule, result (`NOT_SATISFIED` / `INFORMATION_MISSING` / `UNABLE_TO_DETERMINE` / `MANUAL_REVIEW_REQUIRED`), document, field, page, actual, expected, evidence line, recommended action.
3. Per document, `analyzeDocument()` — live AI if configured (else labelled mock). AI-extracted fields are stored with `source=ai_live`; AI observations become findings under rule `R-AI-001`, whose **configured** severity is used.
4. `summarizeFindings()` — run summary + plain-language explanation per finding.
5. Persist run (with ruleset version label, AI mode/provider/model, correlation ID), findings, AI records; supersede old alerts; raise alerts for CRITICAL/HIGH; recompute review priority; set institution-side status (`RECTIFICATION_REQUIRED` or `READY_FOR_SCRUTINY` — never "compliant").

AI failure never blocks steps 2 and 5. Malformed AI output is retried once with a repair instruction, then recorded as `failed_validation` with **no output saved**.

## Four separate kinds of truth

| Kind | Where | Who creates it |
|---|---|---|
| Machine observation | `validation_findings` (`source` = deterministic / ai_live / ai_mock) | rule engine / AI layer |
| Officer-reviewed finding | `validation_findings.review_status` + `review_observations` | officer / admin with reason |
| Verification fact | `document_verifications` (source type DEMO_SOURCE / MANUAL / NOT_CONFIGURED) | adapter or authorized person |
| Official decision | `official_decisions` (+ `certificate_records`, demo only) | admin (authorized demo authority) |

## Main tables

`institutions` 1─n `users` (institution users) · `institutions` 1─n `applications` n─1 `application_categories` 1─n `checklist_items` n─1 `document_types` · `applications` 1─n `uploaded_documents` 1─n `document_pages` / `extracted_document_fields` / `document_verifications` · `applications` 1─n `validation_runs` 1─n `validation_findings` · `validation_runs` n─1 `ruleset_versions` 1─n `validation_rules` · `applications` 1─n `alerts` 1─n `alert_events` · `rectification_requests`, `review_observations`, `application_status_history`, `official_decisions`, `certificate_records`, `ai_analysis_records`, `payment_records` (synthetic ledger), `stored_blobs`, `audit_logs` (UPDATE/DELETE blocked by triggers).

Rule edits never mutate a version that a run references: `updateRule()` clones the active version with the change and activates the clone.

## Security boundaries

- Only `src/server/ai/client.ts` reads API keys; it imports `server-only`. ESLint forbids importing `@/server/*` from `src/components` and `src/lib`. `npm run check:secrets` scans the built client bundle.
- Uploaded files: content-sniffed type, size limit, server-generated UUID storage key, path-traversal guard, private storage, served via `/api/documents/[id]/file` after `assertViewApplication`.
- Officers see only queue-state applications that are unassigned or assigned to them; institutions only their own; unauthorized IDs return 404.

## Review priority (not a fraud score)

`computePriority()` sums documented points over unresolved findings: critical/high ×10, missing mandatory item ×8, expired document ×8, mismatch ×6, duplicate ×5. ≥40 HIGH, ≥15 MEDIUM, else LOW. The factor breakdown is shown wherever the level is shown.

## Known limitations

- Scanned-PDF OCR uses the page's largest embedded image (typical scanner output); vector-only or mosaic pages are reported as unreadable rather than rendered.
- No image forensics / tamper detection beyond hashes, metadata-free text consistency checks and AI text observations — not claimed.
- AI image analysis of infrastructure photos is not implemented; photos are checked for presence, captions, duplicates.
- Verification sources are synthetic or manual; no real issuing authority is contacted.
- Rate limiting is in-memory (per server instance).
- Extraction and validation run synchronously in the request (no job queue).
