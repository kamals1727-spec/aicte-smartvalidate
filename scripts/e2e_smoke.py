"""
Browser end-to-end smoke test of the core demo workflow (DEMO mode, no API key needed).

  login → create application → upload PDFs (incl. a scanned one for OCR) → validate →
  see evidence-linked findings → replace expired document → re-validate → submit →
  officer reviews a finding → institution sees updated status → admin sees audit entry.

Requirements: the app running (npm run build && npm start), a freshly seeded DB
(npm run db:reset), and Python Playwright:  pip install playwright && playwright install chromium
Usage:  python3 scripts/e2e_smoke.py [base_url] [screenshot_dir]
"""
import os
import re
import sys

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
SAMPLES = os.path.join(os.path.dirname(__file__), "..", "samples")
step_no = 0


def step(msg):
    global step_no
    step_no += 1
    print(f"[{step_no:02d}] {msg}", flush=True)


def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=True)


def login(page, email, password):
    page.goto(f"{BASE}/login")
    page.fill("#email", email)
    page.fill("#password", password)
    page.click("button[type=submit]")
    page.wait_for_url(re.compile(r"/app$"))


def logout(page):
    page.context.clear_cookies()


def upload_into_slot(page, label, filename):
    slot = page.locator("div.rounded-lg.border.p-3", has=page.get_by_text(label, exact=True)).first
    slot.locator("input[type=file]").set_input_files(os.path.join(SAMPLES, filename))
    expect(slot.get_by_text(filename.replace(" ", "_"))).to_be_visible(timeout=60_000)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.on("dialog", lambda d: d.accept())

    step("Institution user signs in")
    login(page, "inst1@demo.smartvalidate.test", "Institution@2026")
    expect(page.get_by_text("Institution dashboard")).to_be_visible()
    expect(page.get_by_text("DEMO MODE")).to_be_visible()
    shot(page, "01_institution_dashboard")

    step("Creates an Extension of Approval application")
    page.goto(f"{BASE}/app/applications/new")
    page.get_by_text("Extension of Approval (EoA)", exact=True).click()
    expect(page.get_by_text("Document checklist for Extension of Approval (EoA)")).to_be_visible()
    shot(page, "02_new_application_category")
    page.get_by_role("button", name="Continue").first.click()
    page.locator("div:not([hidden]) >> role=button[name='Continue']").click()
    page.fill("#programmeName", "B.E. Electronics and Communication Engineering")
    page.fill("#previousApprovalRef", "EOA-DEMO-2025-11")
    page.fill("#paymentReference", "TXN-DEMO-778812")
    page.fill("#paymentAmount", "150000")
    page.get_by_role("button", name="Save draft and add documents").click()
    page.wait_for_url(re.compile(r"/app/applications/[^/]+\?created=1"))
    ref = page.locator("h1").inner_text().strip()
    app_url = page.url.split("?")[0]
    print("     created", ref)

    step("Uploads documents (one expired, one scanned → OCR)")
    upload_into_slot(page, "Affidavit / undertaking", "04_affidavit.pdf")
    upload_into_slot(page, "Accreditation certificate", "02_accreditation_expired.pdf")
    upload_into_slot(page, "No Objection Certificate (State / University)", "09_noc_valid.pdf")
    upload_into_slot(page, "Fire safety certificate", "07_fire_safety_scanned.pdf")
    upload_into_slot(page, "Application fee receipt", "05_fee_receipt.pdf")
    page.reload()
    shot(page, "03_documents_uploaded")

    step("Runs AI-assisted validation (DEMO mode)")
    page.get_by_role("button", name="Run AI-assisted validation").click()
    expect(page.get_by_text(re.compile("Validation completed"))).to_be_visible(timeout=120_000)
    page.reload()
    expect(page.get_by_text(re.compile(r"appears to have expired on 2024-01-09"))).to_be_visible()
    expect(page.get_by_text(re.compile("Plain-language explanation — DEMO MODE")).first).to_be_visible()
    shot(page, "04_findings_after_validation")

    step("OCR text from the scanned PDF is stored and shown")
    page.get_by_text("07_fire_safety_scanned.pdf").last.click()
    expect(page.get_by_text("OCR", exact=True).first).to_be_visible()
    expect(page.get_by_text(re.compile("FIRE-DEMO-2026-0311")).first).to_be_visible()

    step("Replaces the expired certificate and re-validates")
    acc_slot = page.locator("div.rounded-lg.border.p-3", has=page.get_by_text("Accreditation certificate", exact=True)).first
    acc_slot.get_by_role("button", name="Replace").click()
    acc_slot.locator("input[type=file]").set_input_files(os.path.join(SAMPLES, "01_accreditation_valid.pdf"))
    expect(acc_slot.get_by_text("01_accreditation_valid.pdf")).to_be_visible(timeout=60_000)
    page.get_by_role("button", name="Run AI-assisted validation").click()
    expect(page.get_by_text(re.compile("Validation completed"))).to_be_visible(timeout=120_000)
    page.reload()
    expect(page.get_by_text(re.compile(r"appears to have expired"))).to_have_count(0)

    step("Submits the application with the declaration")
    page.locator("input[name=declaration]").check()
    page.get_by_role("button", name="Submit for scrutiny").click()
    expect(page.get_by_text(re.compile("It is with AICTE scrutiny"))).to_be_visible(timeout=30_000)
    shot(page, "05_submitted")

    step("Officer sees it in the Application Queue")
    logout(page)
    login(page, "officer1@demo.smartvalidate.test", "Officer@2026")
    page.goto(f"{BASE}/app/queue?q={ref}")
    expect(page.get_by_role("link", name=ref)).to_be_visible()
    shot(page, "06_queue")
    page.get_by_role("link", name=ref).click()
    page.wait_for_url(re.compile(r"/app/review/"))
    shot(page, "07_review_workspace")

    step("Officer records a finding review with a reason")
    form = page.locator("form", has=page.locator("select[name=status]")).first
    form.locator("select[name=status]").select_option("MANUALLY_VERIFIED")
    form.locator("input[name=reason]").fill("Seals and signatures checked against the originals (demo).")
    form.get_by_role("button", name="Record review").click()
    expect(page.get_by_text("Review recorded.")).to_be_visible(timeout=30_000)
    page.reload()
    expect(page.get_by_text(re.compile("Officer review: Manual verification completed")).first).to_be_visible()

    step("Officer runs a demo-source verification on a document")
    page.get_by_role("button", name="Check configured source").first.click()
    expect(page.get_by_text(re.compile("Source check:"))).to_be_visible(timeout=30_000)

    step("Institution sees the updated status")
    logout(page)
    login(page, "inst1@demo.smartvalidate.test", "Institution@2026")
    page.goto(app_url)
    expect(page.get_by_text("Under review", exact=True).first).to_be_visible()
    shot(page, "08_institution_sees_under_review")

    step("Institution cannot open another institution's application (IDOR check)")
    page.goto(f"{BASE}/app/applications/does-not-belong-to-you")
    expect(page.get_by_text("Not found", exact=True)).to_be_visible()

    step("Administrator sees the review in the audit trail and dashboard")
    logout(page)
    login(page, "admin@demo.smartvalidate.test", "Admin@2026")
    page.goto(f"{BASE}/app/admin/audit?q=finding.reviewed")
    expect(page.get_by_text("finding.reviewed").first).to_be_visible()
    shot(page, "09_audit")
    page.goto(f"{BASE}/app")
    shot(page, "10_admin_dashboard")
    for path in ["/app/alerts", "/app/institutions", "/app/payments", "/app/admin/users", "/app/admin/categories", "/app/admin/rules", "/app/health"]:
        page.goto(f"{BASE}{path}")
        expect(page.locator("h1")).to_be_visible()
        shot(page, "11" + path.replace("/", "_"))

    browser.close()
    print("\nE2E smoke test PASSED")
