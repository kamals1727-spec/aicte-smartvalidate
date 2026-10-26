# Demo guide (≈ 6 minutes)

Before presenting: `npm run db:reset`, then `npm run build && npm start` (or `npm run dev`). Open `samples/` in a file browser. Decide whether you're showing DEMO mode or LIVE AI (check the header badge).

## 1. Framing (30 s)
Landing page → "Machines prepare the file. Officials decide." Point at the finding specimen: rule, evidence line, officer review band.

## 2. Institution (2½ min) — `inst1@demo.smartvalidate.test` / `Institution@2026`
1. Dashboard: numbers come from the database (filters work).
2. **New application** → Extension of Approval → checklist appears → Continue → Continue → payment ref `TXN-DEMO-778812`, amount `150000` → Save draft.
3. Upload into the slots: `04_affidavit.pdf`, **`02_accreditation_expired.pdf`**, `09_noc_valid.pdf`, **`07_fire_safety_scanned.pdf`** (scanned — OCR), `05_fee_receipt.pdf`. Skip the NOC first if you want to show a CRITICAL missing-document block.
4. **Run AI-assisted validation**. Show: expired accreditation finding with the exact evidence line and page; the provenance colour/label; the plain-language explanation (DEMO or live); submit blocked if NOC missing.
5. Open "Extracted text and OCR results" → the scanned fire certificate → *OCR* badge and engine confidence.
6. **Replace** the expired file with `01_accreditation_valid.pdf` → re-validate → finding gone → declaration → **Submit**.

## 3. Officer (2 min) — `officer1@demo.smartvalidate.test` / `Officer@2026`
1. **Application queue**: filters (priority, verification, officer), sort, waiting days. Open the new application.
2. Split screen: original on the left, "Extracted text" tab with highlighted mismatches; "Application vs documents" table on the right.
3. **Check configured source** on the accreditation → "Matched synthetic demo registry (not an official authority)". Point out the honesty.
4. Record a review on a finding with a reason. Use **Case actions → Request clarification** to show the institution loop.
5. Open seeded case with the NOC mismatch (Synthetic College of Engineering, Coimbatore) → highlighted DEMO-INST-0099.

## 4. Admin (1 min) — `admin@demo.smartvalidate.test` / `Admin@2026`
1. **Validation rules** → change a severity with a reason → new ruleset version; old runs keep theirs.
2. **Audit trail** → filter `finding.reviewed` / `rule.changed`.
3. **System health** → statuses are real; "Test AI connection".
4. A seeded APPROVED case → demo certificate record with the "DEMO — NOT AN OFFICIAL AICTE CERTIFICATE" watermark.

## Lines to have ready
- "Severity comes from configured rules. The model can't escalate anything."
- "No API key? Everything still runs and every simulated item says so."
- "We never claim a real authority was contacted — demo sources are labelled."
- "Integrating a real registry is one adapter (docs/INTEGRATIONS.md)."
