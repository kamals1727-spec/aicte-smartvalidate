# Adding authorized integrations

Nothing in this prototype connects to AICTE systems or issuing authorities. These are the seams where authorized integrations plug in.

## Document verification sources — `src/server/verification/index.ts`

Implement `VerificationAdapter`:

```ts
const MyAuthorityAdapter: VerificationAdapter = {
  code: "STATE_DTE_API",
  name: "State Directorate of Technical Education — NOC registry",
  sourceType: "AUTHORIZED_API",
  async verify(req) {
    // req: { docTypeCode, documentNumber, institutionId, expiryDate } — values extracted from the document
    // Call the authorized API with credentials from server env vars (never hard-coded, never logged).
    // Map the response to one of the VerificationStatus values.
    return { result: "VERIFIED_BY_SOURCE", method: "Registry API v2", returnedFields: {...}, evidenceRef: "<response id>", notes: "" };
  },
};
```

Register it in `ADAPTERS_BY_DOCTYPE`. The UI, history, audit log and dashboard pick it up automatically. Return `SOURCE_UNAVAILABLE` on outages — an unavailable source is never treated as non-compliance. Other method types that fit the same interface: QR-code payload verification, digital-signature validation of signed PDFs, an authorized document repository lookup.

## Institution records

Seeded `institutions` rows are synthetic. Replace `seedScenarios()` with an import job from the authorized institution master, keyed by the official institution ID.

## Payments — `src/server/services/payments.ts` and rule `PAYMENT_MATCH`

The `payment_records` table is a synthetic ledger. Replace the lookup with a reconciliation feed from the authorized payment system. Never collect card numbers or banking credentials in this app.

## Rules

Enter real requirements as `validation_rules` rows with `sourceReference` pointing to the exact handbook section. Rule types available: required field, required document (from checklist), expiry, date consistency, field comparison, institution-record comparison, duplicate file, extraction completeness, payment reconciliation, intake threshold, manual verification, AI observation.

## AI provider

`src/server/ai/client.ts` → `completeJson()` is the single integration point. To use a government-hosted or self-hosted model, add a branch that calls it and returns `{ text, inputTokens, outputTokens }`; Zod validation, caching, retry and fallback stay unchanged.

## Storage

`src/server/storage.ts` has `local` and `database` drivers. Add an object-storage driver (private bucket, server-side encryption, signed short-lived reads) for production.
