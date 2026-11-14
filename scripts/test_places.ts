// Gyvas vietų ir paieškos testas su klausimais, į kuriuos v1 neatsakė.
// Paleisti: node scripts/test_places.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findPlace, hoursToday, matchCategory, translateHours } from "../supabase/functions/_shared/places.ts";
import { searchWeb } from "../supabase/functions/_shared/search.ts";

// Offline: darbo laiko vertimas ir kategorijos
const sat = new Date("2026-11-14T10:00:00Z"); // šeštadienis
assert.equal(translateHours("Mo-Fr 08:00-18:00; Sa off"), "pirmadienis–penktadienis 8:00–18:00; šeštadienis nedirba");
assert.equal(hoursToday("Mo-Fr 08:00-18:00; Sa 09:00-14:00", sat), "šiandien dirba 9:00–14:00");
assert.equal(hoursToday("Mo-Fr 08:00-18:00; Sa off", sat), "šiandien nedirba");
assert.equal(hoursToday("Tu-Th 07:00-18:00; Fr 07:00-19:00; Sa 07:00-18:00; Su 07:00-16:00; Mo off", sat), "šiandien dirba 7:00–18:00");
assert.equal(hoursToday("24/7", sat), "dirba visą parą");
assert.equal(hoursToday("Mo-Fr 07:00-20:00", sat), "šiandien nedirba"); // šeštadienio grafike nėra
assert.equal(hoursToday("keista reikšmė", sat), null);
assert.equal(hoursToday("Tu-Fr 08:00-17:00, Sa-Su 08:00-14:00", sat), "šiandien dirba 8:00–14:00"); // kablelis vietoj ;
assert.equal(hoursToday("Mo-Fr 08:00-12:00,13:00-17:00; Sa 09:00-13:00", sat), "šiandien dirba 9:00–13:00"); // pietų pertrauka
assert.equal(matchCategory("artimiausia poliklinika")?.label, "gydymo įstaiga");
assert.equal(matchCategory("vaistinę")?.label, "vaistinė");
assert.equal(matchCategory("paštas")?.label, "paštas");
assert.equal(matchCategory("didelis pastatas"), undefined);
console.log("✓ offline testai praėjo\n");

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

const timed = async (label: string, fn: () => Promise<{ message: string }>) => {
  const t = Date.now();
  try {
    const r = await fn();
    console.log(`✓ ${label} (${((Date.now() - t) / 1000).toFixed(1)} s)\n   ${r.message.slice(0, 600).replace(/\n+/g, " ")}\n`);
  } catch (e) {
    console.log(`✗ ${label} (${((Date.now() - t) / 1000).toFixed(1)} s)\n   ${(e as Error).message}\n`);
  }
};

await timed("Halės turgus", () => findPlace("Halės turgus", { city: "Vilnius" }));
await timed("Bagažinių turgus Kaunas", () => findPlace("Bagažinių turgus", { city: "Kaunas" }));
await timed("Poliklinika prie Gedimino kalno", () => findPlace("poliklinika", { near: "Gedimino kalnas", city: "Vilnius" }));
await timed("Vaistinė prie Savanorių pr. 100 Kaune", () => findPlace("vaistinė", { near: "Savanorių prospektas 100", city: "Kaunas" }));
await timed("Web: Urmo bazė darbo laikas", () => searchWeb("Urmo bazė Kaunas darbo laikas", env.FIRECRAWL_API_KEY));
await timed("Web: Bagažinių turgus darbo laikas", () => searchWeb("Bagažinių turgus Kaunas Elektrėnų g. darbo laikas", env.FIRECRAWL_API_KEY));
await timed("Web details: Urmo bazė", () => searchWeb("Urmo bazė Kaunas darbo laikas", env.FIRECRAWL_API_KEY, { withContent: true }));
