// „Kas arti“ tikslumo vertinimas: find_place vs Overpass (visi OSM objektai, tikras atstumas).
// Paleisti: node scripts/eval/eval_places.ts
// Naudoja LOCATIONIQ_API_KEY iš .env (kaip produkcijoje).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findPlace } from "../../supabase/functions/_shared/places.ts";
import { overpassNearby } from "./overpass.ts";

for (const l of readFileSync(join(import.meta.dirname, "..", "..", ".env"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && m[2].trim()) process.env[m[1]] = m[2].trim();
}

const FILTERS: Record<string, string> = {
  "parduotuvė": `[shop~"^(supermarket|convenience)$"]`,
  "vaistinė": `[amenity=pharmacy]`,
  "paštas": `[amenity=post_office]`,
  "bankomatas": `[amenity=atm]`,
  "poliklinika": `[amenity~"^(clinic|doctors|hospital)$"]`,
  "degalinė": `[amenity=fuel]`,
};

// [ko ieško, šalia ko, miestas]
const CASES: [string, string, string][] = [
  ["parduotuvė", "ISM universitetas", "Vilnius"],
  ["vaistinė", "Gedimino pr. 9", "Vilnius"],
  ["paštas", "Akropolis", "Vilnius"],
  ["poliklinika", "Antakalnio g. 59", "Vilnius"],
  ["degalinė", "Ukmergės g. 220", "Vilnius"],
  ["vaistinė", "Santaros klinikos", "Vilnius"],
  ["parduotuvė", "Žirmūnų g. 70", "Vilnius"],
  ["vaistinė", "Kauno pilis", "Kaunas"],
  ["parduotuvė", "Savanorių pr. 100", "Kaunas"],
  ["bankomatas", "Laisvės al. 50", "Kaunas"],
  ["parduotuvė", "Teatro aikštė", "Klaipėda"],
  ["vaistinė", "Taikos pr. 61", "Klaipėda"],
  ["vaistinė", "Prisikėlimo aikštė", "Šiauliai"],
  ["parduotuvė", "Tilžės g. 100", "Šiauliai"],
  ["paštas", "Respublikos g. 50", "Panevėžys"],
  ["parduotuvė", "Rotušės aikštė", "Alytus"],
];

let top1 = 0, inTop3 = 0, evaluated = 0, totalTime = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const [what, near, city] of CASES) {
  const label = `${what} prie „${near}“, ${city}`;
  const t = Date.now();
  let ours;
  try {
    ours = await findPlace(what, { near, city });
  } catch (e) {
    console.log(`✗ ${label}: įrankis nerado (${(e as Error).message})\n`);
    evaluated++;
    continue;
  }
  const ms = Date.now() - t;
  totalTime += ms;
  const o = ours.origin!;
  let truth;
  try {
    truth = await overpassNearby(o.lat, o.lon, FILTERS[what], 1500);
  } catch (e) {
    console.log(`? ${label}: Overpass neatsakė, praleidžiu (${(e as Error).message})\n`);
    continue;
  }
  evaluated++;
  const t1 = truth[0];
  const our1 = ours.places[0];
  // Ta pati vieta: vienodas pavadinimas ir atstumas ±40 m (skirtingi OSM taškai tam pačiam objektui)
  const same = (a: { name: string; distance_m?: number }, b: { name: string; d: number }) =>
    a.name.toLowerCase() === b.name.toLowerCase() && Math.abs((a.distance_m ?? 0) - b.d) <= 40;
  const ok1 = !!t1 && same(our1, t1);
  const ok3 = !!t1 && ours.places.some((p) => same(p, t1));
  if (ok1) top1++;
  if (ok3) inTop3++;
  console.log(`${ok1 ? "✓" : ok3 ? "~" : "✗"} ${label} (${(ms / 1000).toFixed(1)} s)`);
  console.log(`   pradžios taškas: ${o.name?.slice(0, 90)}`);
  console.log(`   mūsų:   ${ours.places.map((p) => `${p.name} ${p.distance_m}m`).join(" | ")}`);
  console.log(`   tiesa:  ${truth.slice(0, 4).map((p) => `${p.name} ${p.d}m`).join(" | ")}\n`);
  await sleep(1500); // mandagiai su viešais serveriais
}

console.log(`=== Rezultatas: artimiausia teisingai ${top1}/${evaluated}, tarp 3 pirmų ${inTop3}/${evaluated}, vid. laikas ${(totalTime / Math.max(1, evaluated) / 1000).toFixed(1)} s ===`);
