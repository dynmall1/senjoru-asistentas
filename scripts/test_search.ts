// Gyvas paieškos testas (Firecrawl).  Paleisti: node scripts/test_search.ts ["užklausa"]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { searchWeb } from "../supabase/functions/_shared/search.ts";

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

const queries = process.argv[2] ? [process.argv[2]] : ["LRT naujienos šiandien", "Kauno kalėdinės eglės įžiebimas 2026"];
for (const q of queries) {
  const t = Date.now();
  const r = await searchWeb(q, env.FIRECRAWL_API_KEY, { recent: q.includes("naujienos") });
  console.log(`\n=== ${q} (${((Date.now() - t) / 1000).toFixed(1)} s, ${r.message.length} simb.) ===`);
  for (const s of r.sources) console.log(`  • ${s.title} | ${s.url}`);
  console.log(r.message.slice(0, 900) + (r.message.length > 900 ? " …" : ""));
}
