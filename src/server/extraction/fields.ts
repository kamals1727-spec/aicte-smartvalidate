// Deterministic field parser. Pulls labelled values ("Valid Until: 14/06/2028") out of
// extracted page text. Pure functions — unit tested in tests/fields.test.ts.

export interface PageText {
  pageNumber: number;
  text: string;
}

export interface ParsedField {
  field: string;
  value: string;
  page: number;
  evidence: string;
}

const PATTERNS: { field: string; re: RegExp }[] = [
  { field: "institution_name", re: /(?:institution|institute|college)\s*name\s*[:\-–]\s*(.+)/i },
  { field: "institution_id", re: /(?:institution|institute|college)\s*(?:id|ref(?:erence)?(?:\s*(?:no|number))?|code)\s*[:\-–]\s*([A-Z0-9][A-Z0-9\-\/]+)/i },
  { field: "document_number", re: /(?:certificate|noc|affidavit|document|ref(?:erence)?)\s*(?:no\.?|number|reference|ref)\s*[:\-–]\s*([A-Z0-9][A-Z0-9\-\/]+)/i },
  { field: "issue_date", re: /(?:date\s*of\s*issue|issue\s*date|issued\s*on)\s*[:\-–]\s*(.+)/i },
  { field: "expiry_date", re: /(?:valid\s*(?:until|upto|up\s*to|till)|expiry\s*date|expires\s*on|date\s*of\s*expiry)\s*[:\-–]\s*(.+)/i },
  { field: "issued_by", re: /issued\s*by\s*[:\-–]\s*(.+)/i },
  { field: "transaction_reference", re: /(?:transaction|payment)\s*(?:ref(?:erence)?|id|no\.?)\s*[:\-–]\s*([A-Z0-9][A-Z0-9\-\/]+)/i },
  { field: "amount", re: /amount(?:\s*paid)?\s*[:\-–]\s*(?:inr|rs\.?|₹)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i },
  { field: "payment_date", re: /payment\s*date\s*[:\-–]\s*(.+)/i },
];

export function parseFields(pages: PageText[]): ParsedField[] {
  const out: ParsedField[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    for (const rawLine of p.text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      for (const { field, re } of PATTERNS) {
        if (seen.has(field)) continue;
        const m = line.match(re);
        if (m && m[1]) {
          const value = m[1].trim().replace(/\s{2,}/g, " ").slice(0, 200);
          if (!value) continue;
          out.push({ field, value, page: p.pageNumber, evidence: line.slice(0, 240) });
          seen.add(field);
        }
      }
    }
  }
  return out;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse common Indian document date formats. Returns null when ambiguous/unparseable —
 * callers must treat null as "unable to determine", never as expired.
 * Supported: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, "14 June 2028", "June 14, 2028".
 */
export function parseDate(input: string): Date | null {
  const s = input.trim().replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return mk(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return mk(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] !== undefined) return mk(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] !== undefined) return mk(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  return null;
}

function mk(y: number, mo: number, d: number): Date | null {
  if (y < 1950 || y > 2100 || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo, d));
  if (dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) return null; // e.g. 31/02
  return dt;
}

/** Normalise names for comparison: lower-case, strip punctuation and common filler words. */
export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|of|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token-set similarity in [0,1] (Jaccard over word tokens). Deterministic and explainable. */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normaliseName(a).split(" ").filter(Boolean));
  const tb = new Set(normaliseName(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function normaliseRef(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
