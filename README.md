# AICTE SmartValidate (prototype)

AI-assisted preliminary scrutiny of technical-institution approval applications — problem statement **26261**.

> **Independent hackathon prototype.** Not an official AICTE portal, not affiliated with AICTE or the Ministry of Education. All institutions, documents, payments, verification sources and decisions in it are **synthetic**.

What it does, end to end:

1. An institution signs in, picks an application category, fills in details and uploads PDFs / images against the category's document checklist.
2. Every file is checked by content (not extension), fingerprinted with SHA-256, stored privately, and its text is extracted — PDF text layer first, **OCR (tesseract.js) for scanned pages and photos**, running on the server with locally bundled language data.
3. **Deterministic, versioned rules** check completeness, expiry, date consistency, name/ID mismatches, duplicates, payment reconciliation and intake logic.
4. An **AI layer** (Google Gemini or Anthropic Claude, if a key is configured) analyses each document and explains every finding in plain language. Without a key the app runs in clearly labelled **DEMO MODE** with deterministic template explanations.
5. Findings are shown with rule, severity, document, page, evidence line, expected vs actual — and the source (rule / live AI / simulated demo).
6. The institution submits; a scrutiny officer reviews it in the queue, confirms or dismisses findings with reasons, verifies documents (synthetic demo source or manual), requests clarification; an authorized admin records the official decision. Everything lands in an **append-only audit trail**.

The AI never approves, rejects, or declares forgery. Severity always comes from the configured rule, never from the model.

---

## 1. Quick start (local, no API key needed)

Requirements: **Node.js 20 or 22 (LTS)** and npm. Nothing else — the database is a local SQLite file.

```bash
npm install
cp .env.example .env.local        # Windows PowerShell: copy .env.example .env.local
npm run setup                     # creates the database (migrations) and seeds synthetic demo data
npm run dev                       # http://localhost:3000
```

Production-mode run on your laptop (production refuses to start sessions without a real secret):

```bash
# put a random SESSION_SECRET (32+ chars) in .env.local first, e.g. the output of:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run build
npm start
```

### Demo accounts (local demonstration only)

| Role | Email | Password |
|---|---|---|
| Institution | `inst1@demo.smartvalidate.test` (also inst2 … inst5) | `Institution@2026` |
| Scrutiny officer | `officer1@demo.smartvalidate.test` (also officer2) | `Officer@2026` |
| Administrator | `admin@demo.smartvalidate.test` | `Admin@2026` |

Set `SEED_DEMO_PASSWORD` before seeding to give every demo account a password of your choice. **Never use the default passwords on a public deployment.**

### Database commands

| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply SQL migrations in `drizzle/` to `DATABASE_URL` |
| `npm run db:seed` | Seed an empty database with the synthetic dataset (14 applications) |
| `npm run db:reset` | **Wipe everything** (including the audit log and local uploads) and re-seed |
| `npm run db:generate` | Generate a new migration after editing `src/server/db/schema.ts` |

### Sample documents for the live demo

`samples/` contains synthetic PDFs for **inst1** (Synthetic Institute of Technology, Chennai, `DEMO-INST-0001`): a valid and an expired accreditation certificate, a NOC with a wrong institution name, an affidavit, a fee receipt (`TXN-DEMO-778812`, ₹150000), a byte-identical duplicate, and a **scanned** fire-safety certificate (PNG and image-only PDF) to show OCR. Regenerate with `python3 scripts/make-samples.py samples` (needs `pip install reportlab pillow`).

---

## 2. Turning on real AI (optional)

The app picks the provider from server-side environment variables only. Keys are never sent to the browser.

### Option A — Google Gemini (has a free tier)

1. Sign in at <https://aistudio.google.com> with a Google account and create an API key.
2. In AI Studio, note the ID of a model your account can use on the free tier (a "Flash" model).
3. In `.env.local`:
   ```
   GEMINI_API_KEY=your-key
   GEMINI_MODEL=the-model-id-from-ai-studio
   ```
4. Restart (`npm run dev`). The banner disappears and the header shows **AI: live**. As administrator, open **System health → Test AI connection**.

Free-tier limits are small (a few requests per minute). Each validation makes one call per document plus one summary call; results are **cached** by document hash + ruleset + prompt version + model, so re-validating unchanged documents costs nothing. **Privacy:** on Google's free tier, submitted content may be used to improve Google's products — only upload the synthetic sample documents.

### Option B — Anthropic Claude (paid API credits)

Create a key in the Anthropic Console (billed separately from a claude.ai subscription), then set `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` (model ID from <https://docs.claude.com>). If both providers are configured, `AI_PROVIDER=auto` prefers Gemini; set `AI_PROVIDER=anthropic` to force Claude.

### Option C — Groq or any OpenAI-compatible API (free tier, higher limits)

1. Create a free key at <https://console.groq.com/keys>.
2. In `.env.local`:
   ```
   AI_PROVIDER=openai_compat
   OPENAI_COMPAT_API_KEY=your-key
   OPENAI_COMPAT_MODEL=a-model-id-from-console.groq.com/docs/models
   ```
3. Restart (`npm run dev`) and use **System health → Test AI connection**.

`OPENAI_COMPAT_BASE_URL` defaults to Groq; set it to `https://openrouter.ai/api/v1` (OpenRouter, models ending in `:free`) or `https://api.cerebras.ai/v1` (Cerebras) to use those instead. Replies use JSON mode and are validated against the same Zod schemas as the other providers.

### Modes

| Mode | When | What you see |
|---|---|---|
| **LIVE** | key + model set, recent calls succeeding | AI summaries/explanations labelled "generated by live AI model" |
| **DEGRADED** | key set but calls failing (bad key, 429, outage) | amber banner; deterministic validation continues; explanations fall back to labelled demo output |
| **DEMO** | no key or model | purple banner on every page; every simulated item labelled "DEMO MODE — simulated" |

What is sent to the AI: only the extracted text of the documents of the application being validated (truncated to `AI_MAX_DOC_CHARS`), plus that application's declared name/ID/year/programme/payment reference. Document text is fenced as untrusted data; instructions inside documents are ignored and cannot close the fence.

---

## 3. Tests and checks

```bash
npm test               # 36 tests: rule engine, field parsing, OCR, AI service (provider mocked), full workflow + authorization
npm run lint
npm run typecheck
npm run build
npm run check:secrets  # fails if an API key or secret name appears in the browser bundle
npm run verify         # all of the above in order
```

Tests use their own temporary SQLite databases, mock the AI SDK, and never need a key or network.

Browser end-to-end smoke test (optional, needs Python Playwright):

```bash
npm run db:reset && npm run build && npm start      # in one terminal
pip install playwright && playwright install chromium
python3 scripts/e2e_smoke.py http://localhost:3000  # in another
```

It drives the real UI: login → create → upload (incl. scanned PDF) → validate → replace expired document → re-validate → submit → officer queue → finding review → demo-source verification → institution sees "Under review" → IDOR check → admin audit trail.

---

## 4. Deploying (GitHub → Vercel + Turso)

Vercel's serverless functions have no persistent disk, so a local SQLite file and local uploads will not survive there. The app supports a hosted libSQL database (Turso) through the **same code path**, and can store uploaded files inside the database.

1. Create a database at <https://turso.tech> (check its current free tier). Copy the database URL (`libsql://…`) and create an auth token.
2. From your laptop, migrate and seed the hosted database (note `STORAGE_DRIVER=database` so the seeded sample files are stored in the DB):
   ```bash
   DATABASE_URL="libsql://your-db.turso.io" DATABASE_AUTH_TOKEN="…" STORAGE_DRIVER=database SEED_DEMO_PASSWORD="choose-a-strong-one" npm run db:reset
   ```
   (PowerShell: set each with `$env:NAME="value"` first.)
3. Push the repo to GitHub (`.env*`, `*.db` and `storage/` are git-ignored — check `git status` before committing).
4. Import the repo in Vercel and set Environment Variables:
   ```
   DATABASE_URL=libsql://your-db.turso.io
   DATABASE_AUTH_TOKEN=…
   SESSION_SECRET=<64 random hex chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
   STORAGE_DRIVER=database
   MAX_UPLOAD_MB=4            # Vercel limits request bodies to ~4.5 MB
   GEMINI_API_KEY=…           # optional
   GEMINI_MODEL=…             # optional
   ```
5. Deploy. Sign in and check **System health**.

**Not verified by the author on Vercel/Turso.** The local production build (`npm run build && npm start`) and all tests were run; the hosted path uses the same code but was not deployed during development. OCR of large scanned files can approach serverless time limits (the upload route sets `maxDuration = 60`). The simplest reliable demo is still `npm start` on your own laptop.

---

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `SESSION_SECRET must be set` on `npm start` | Set `SESSION_SECRET` (32+ chars) in `.env.local`. Dev mode uses an insecure fallback; production refuses to. |
| Banner says DEGRADED, health shows **401/403** | API key wrong or revoked. |
| **429 / rate limit** | Free tier exhausted for the minute/day. Wait; cached results avoid repeat calls. |
| **400 / bad request** | Usually a wrong `GEMINI_MODEL` / `ANTHROPIC_MODEL` ID. |
| Scanned PDF shows "No text" | OCR reads the page's embedded scan image. PDFs whose pages are vector drawings or multi-image mosaics aren't OCR'd — upload as PNG/JPEG or a cleaner scan. |
| "Password-protected" / "corrupt" upload error | Re-export the PDF without a password / from the original source. |
| Data looks wrong after experiments | `npm run db:reset` |

---

## 6. Prototype vs production security

Implemented here: bcrypt password hashes; signed HTTP-only session cookies; server-side role, resource (IDOR → 404) and workflow-state checks on every action; zod validation of every input; content-sniffed file types, size limits, generated storage keys (no user-controlled paths), files outside the web root served only through an authorized route with `nosniff`; same-origin check on the upload endpoint (server actions have Next.js's built-in origin check); security headers; best-effort login rate limiting; append-only audit log enforced by DB triggers; no secrets in the client bundle (checked by script); document text never logged.

Needed before any real deployment: SSO / MFA; a shared rate-limit store; malware scanning of uploads; encrypted object storage with retention/deletion policies; a CSP tuned for the app; a DPDP-Act-aligned data-processing agreement for any external AI provider (or a self-hosted model); formal authorization of every verification source; penetration testing; real AICTE rules from the Approval Process Handbook entered and reviewed by domain owners.

See `docs/ARCHITECTURE.md`, `docs/INTEGRATIONS.md` and `docs/DEMO_GUIDE.md`.
