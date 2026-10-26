import Link from "next/link";
import { btnClass } from "@/components/ui";
import { DEMO_DISCLAIMER } from "@/lib/constants";
import { Mark } from "@/components/brand";

const STAGES = [
  { t: "Institution uploads", d: "Category-specific checklist, PDF / image upload, SHA-256 fingerprint on every file." },
  { t: "Text extraction and OCR", d: "PDF text layer first; scanned pages and photos go through an OCR engine that runs on the server." },
  { t: "Deterministic rules", d: "Versioned, configurable rules check completeness, expiry, mismatches, duplicates and payments." },
  { t: "AI explanation", d: "A language model explains findings and flags potential inconsistencies. It never decides." },
  { t: "Officer review", d: "Every finding is confirmed, dismissed or sent for verification by a person, with reasons on record." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <div className="bg-navy-950 px-4 py-2 text-center text-xs text-navy-100">{DEMO_DISCLAIMER}</div>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="font-serif text-lg font-semibold text-navy-900">SmartValidate</span>
        </div>
        <Link href="/login" className={btnClass("primary")}>
          Sign in
        </Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div>
            <h1 className="font-serif text-4xl font-semibold leading-[1.1] tracking-tight text-navy-900 sm:text-5xl">
              Preliminary scrutiny of approval applications, with every finding traceable to its evidence.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              SmartValidate checks technical-institution applications for missing, expired, duplicated and inconsistent documents before an official
              ever opens the file — and shows exactly which rule, page and line produced each finding.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className={btnClass("primary")}>
                Open the demo
              </Link>
              <a href="#how" className={btnClass("secondary")}>
                See how a case moves
              </a>
            </div>
            <p className="mt-6 text-sm text-muted">Problem statement 26261 · Hackathon prototype</p>
          </div>

          <FindingSpecimen />
        </section>

        <section id="how" className="border-t border-line bg-paper">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="font-serif text-2xl font-semibold text-navy-900">How a case moves</h2>
            <p className="mt-2 max-w-2xl text-muted">Machines prepare the file. People make the decisions. The system keeps those two things visibly separate.</p>
            <ol className="mt-8 grid gap-4 md:grid-cols-5">
              {STAGES.map((s, i) => (
                <li key={s.t} className="rounded-lg border border-line bg-white p-4">
                  <div className="text-sm font-semibold text-action">Step {i + 1}</div>
                  <div className="mt-1 font-medium text-ink">{s.t}</div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3">
          <Principle title="Decision support only">The AI never approves, rejects or declares forgery. Official decisions are recorded only by authorized users.</Principle>
          <Principle title="Honest about its sources">Demo verification sources, simulated AI output and synthetic payments are labelled wherever they appear.</Principle>
          <Principle title="Append-only audit trail">Uploads, validation runs, rule changes and reviews are logged with actor, time and correlation ID. The log cannot be edited.</Principle>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-6 text-center text-xs text-muted">
        Independent prototype. Not affiliated with, endorsed by, or operated by AICTE or the Ministry of Education. All data is synthetic.
      </footer>
    </div>
  );
}

function Principle({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

/** A real-looking finding card — the product's core artefact — as the hero visual. */
function FindingSpecimen() {
  return (
    <div className="self-center">
      <div className="rounded-xl border border-line bg-paper p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between text-xs text-muted">
          <span>Application SV-2026-7UMZUD · Extension of Approval</span>
          <span>Ruleset demo-2026.1</span>
        </div>
        <article className="flex overflow-hidden rounded-lg border border-line bg-white">
          <div className="w-1.5 shrink-0 bg-navy-700" aria-hidden />
          <div className="min-w-0 flex-1 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-bad-bg px-2 py-0.5 text-xs font-medium text-bad">High</span>
              <span className="text-xs text-muted">FND-Q4M7K2P · R-EXP-001 · Deterministic rule</span>
            </div>
            <p className="mt-2 font-medium text-ink">“Accreditation certificate” appears to have expired on 2024-01-09.</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Found on page 1</dt>
                <dd className="mt-0.5 rounded bg-bad-bg/60 px-1.5 py-0.5 font-mono text-[13px] text-bad">Valid Until: 09/01/2024</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Expected</dt>
                <dd className="mt-0.5 text-ink">On or after the validation date</dd>
              </div>
            </dl>
          </div>
        </article>
        <div className="mt-2 flex overflow-hidden rounded-lg border border-line bg-white">
          <div className="w-1.5 shrink-0 bg-ok" aria-hidden />
          <p className="p-3 text-sm text-ink">
            <span className="font-medium">Officer review:</span> <span className="text-muted">Confirmed deficiency — institution asked for a current certificate.</span>
          </p>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted">Every finding shows its rule, evidence line and who has reviewed it.</p>
    </div>
  );
}
