"""Generate SYNTHETIC demo documents for AICTE SmartValidate.

Every file produced here is fake and clearly marked as a demo document.
Usage:  python3 scripts/make-samples.py samples
Requires: pip install reportlab pillow
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

out = sys.argv[1] if len(sys.argv) > 1 else "samples"
os.makedirs(out, exist_ok=True)


def cert(fn, title, lines):
    c = canvas.Canvas(os.path.join(out, fn), pagesize=A4)
    w, h = A4
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(w / 2, h - 80, "SYNTHETIC DEMO DOCUMENT - NOT A REAL CERTIFICATE")
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(w / 2, h - 130, title)
    c.setFont("Helvetica", 12)
    y = h - 190
    for line in lines:
        c.drawString(72, y, line)
        y -= 24
    c.save()


base = [
    "Institution Name: Synthetic Institute of Technology, Chennai",
    "Institution ID: DEMO-INST-0001",
]

cert("01_accreditation_valid.pdf", "Accreditation Certificate", base + [
    "Certificate No: ACC-DEMO-2026-0101",
    "Issued By: Demo Accreditation Board (synthetic)",
    "Date of Issue: 15/06/2025",
    "Valid Until: 14/06/2028",
    "Programmes: B.E. Computer Science, B.E. Electronics and Communication",
])
cert("02_accreditation_expired.pdf", "Accreditation Certificate", base + [
    "Certificate No: ACC-DEMO-2021-0077",
    "Issued By: Demo Accreditation Board (synthetic)",
    "Date of Issue: 10/01/2021",
    "Valid Until: 09/01/2024",
    "Programmes: B.E. Mechanical Engineering",
])
cert("03_noc_name_mismatch.pdf", "No Objection Certificate", [
    "Institution Name: Synthetic Institute of Engineering, Madurai",
    "Institution ID: DEMO-INST-0099",
    "NOC Reference: NOC-DEMO-2026-0042",
    "Issued By: Demo State Department of Technical Education (synthetic)",
    "Date of Issue: 02/03/2026",
    "Valid Until: 01/03/2029",
])
cert("04_affidavit.pdf", "Affidavit / Undertaking", base + [
    "Affidavit Reference: AFF-DEMO-2026-0005",
    "Date of Issue: 20/07/2026",
    "The institution undertakes that the information submitted is true (synthetic demo).",
])
cert("05_fee_receipt.pdf", "Application Fee Receipt", base + [
    "Transaction Reference: TXN-DEMO-778812",
    "Amount Paid: INR 150000",
    "Payment Date: 05/08/2026",
    "Payment Status: SUCCESS (synthetic ledger)",
])
cert("09_noc_valid.pdf", "No Objection Certificate", base + [
    "NOC Reference: NOC-DEMO-2026-0050",
    "Issued By: Demo State Department of Technical Education (synthetic)",
    "Date of Issue: 02/03/2026",
    "Valid Until: 01/03/2029",
])

# "Scanned" document: text rendered into an image, so it has no PDF text layer.
img = Image.new("RGB", (1654, 2339), "white")
d = ImageDraw.Draw(img)
try:
    f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 40)
    fb = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 52)
except Exception:  # pragma: no cover - font fallback
    f = fb = ImageFont.load_default()
y = 200
d.text((180, y), "Fire Safety Certificate", font=fb, fill="black")
y += 120
for line in [
    "SYNTHETIC DEMO DOCUMENT",
    "Institution Name: Synthetic Institute of Technology, Chennai",
    "Institution ID: DEMO-INST-0001",
    "Certificate No: FIRE-DEMO-2026-0311",
    "Date of Issue: 11/02/2026",
    "Valid Until: 10/02/2027",
]:
    d.text((180, y), line, font=f, fill="black")
    y += 80
img = img.rotate(0.6, fillcolor="white")
img.save(os.path.join(out, "06_fire_safety_scanned.png"))
img.convert("L").save(os.path.join(out, "07_fire_safety_scanned.pdf"), "PDF", resolution=200)
print("Synthetic samples written to", out)
