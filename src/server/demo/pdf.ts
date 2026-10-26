// Tiny text-only PDF writer used to generate SYNTHETIC demo documents for the seed and
// tests (no external tools needed). Output is a valid PDF 1.4 with a real text layer.

function esc(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function makeTextPdf(title: string, lines: string[]): Buffer {
  const content: string[] = ["BT", "/F2 12 Tf", "1 0 0 1 72 780 Tm", "(SYNTHETIC DEMO DOCUMENT - NOT A REAL CERTIFICATE) Tj", "ET"];
  content.push("BT", "/F2 18 Tf", "1 0 0 1 72 740 Tm", `(${esc(title)}) Tj`, "ET");
  let y = 700;
  for (const l of lines) {
    content.push("BT", "/F1 12 Tf", `1 0 0 1 72 ${y} Tm`, `(${esc(l)}) Tj`, "ET");
    y -= 22;
  }
  const stream = content.join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
