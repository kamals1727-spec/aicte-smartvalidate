// Fails if anything that looks like an API key ended up in the browser bundle.
// Run after `npm run build`:  npm run check:secrets
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(".next/static");
if (!existsSync(root)) {
  console.error("No .next/static folder — run `npm run build` first.");
  process.exit(1);
}
const needles = [
  { name: "Anthropic key prefix", re: /sk-ant-[A-Za-z0-9_-]{10,}/ },
  { name: "Google API key prefix", re: /AIza[0-9A-Za-z_-]{30,}/ },
  { name: "ANTHROPIC_API_KEY name", re: /ANTHROPIC_API_KEY/ },
  { name: "GEMINI_API_KEY name", re: /GEMINI_API_KEY/ },
  { name: "SESSION_SECRET name", re: /SESSION_SECRET/ },
];
for (const v of ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "SESSION_SECRET", "DATABASE_AUTH_TOKEN"]) {
  const val = process.env[v];
  if (val && val.length >= 8) needles.push({ name: `value of ${v}`, re: new RegExp(val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
}
let files = 0;
const hits = [];
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|html|json|map|txt)$/.test(f)) {
      files++;
      const s = readFileSync(p, "utf8");
      for (const n of needles) if (n.re.test(s)) hits.push(`${n.name} in ${path.relative(".", p)}`);
    }
  }
}
walk(root);
if (hits.length) {
  console.error("Possible secret exposure in client bundle:\n  " + hits.join("\n  "));
  process.exit(1);
}
console.log(`OK — scanned ${files} client bundle files, no keys or secret names found.`);
