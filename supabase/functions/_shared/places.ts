// Vietų paieška iš OpenStreetMap (nemokama, be rakto):
//  • konkreti vieta: „Halės turgus“ → adresas, darbo laikas, telefonas
//  • kas arti: „vaistinė prie Savanorių pr. 100“ → 3 artimiausios su atstumu ir darbo laiku
// Pagrindinis: Nominatim (patikimas; politika: ≤1 užklausa/s, User-Agent).
// Atsarginis: Photon (atlaidesnis netiksliems pavadinimams, bet viešas serveris kartais neatsako).
// Veikia Deno ir Node 18+.

import { stripDiacritics, vilniusParts } from "./lt.ts";

export class PlaceError extends Error {}

const UA = { "User-Agent": "senjoru-asistentas/1.0 (hackathon prototype)" };
const NOMINATIM = "https://nominatim.openstreetmap.org";
const MAX_RESULTS = 3;
const NEARBY_BOX_DEG = 0.02; // ~2 km į kiekvieną pusę

type Place = { name: string; address: string; lat: number; lon: number; tags: Record<string, string>; distance_m?: number };

// ── Kategorijos: lietuviški žodžiai → Nominatim raktažodžiai (OSM „special phrases“) ──
const CATEGORIES: { stems: string[]; label: string; keywords: string[] }[] = [
  { stems: ["poliklin", "gydytoj", "klinik", "medicin", "sveikatos"], label: "gydymo įstaiga", keywords: ["clinic", "doctors"] },
  { stems: ["ligonin"], label: "ligoninė", keywords: ["hospital"] },
  { stems: ["vaistin"], label: "vaistinė", keywords: ["pharmacy"] },
  { stems: ["odontolog", "dant"], label: "odontologas", keywords: ["dentist"] },
  { stems: ["parduotuv", "maxima", "rimi", "lidl", "norfa", "maist", "prekybos"], label: "parduotuvė", keywords: ["supermarket", "convenience store"] },
  { stems: ["pastas", "pasto", "pastomat"], label: "paštas", keywords: ["post office"] },
  { stems: ["bankomat"], label: "bankomatas", keywords: ["atm"] },
  { stems: ["bank"], label: "bankas", keywords: ["bank"] },
  { stems: ["turg"], label: "turgus", keywords: ["marketplace"] },
  { stems: ["baznyc", "koscio", "cerkv"], label: "bažnyčia", keywords: ["church"] },
  { stems: ["kirpykl", "kirpej"], label: "kirpykla", keywords: ["hairdresser"] },
  { stems: ["kavin", "restoran", "valgykl"], label: "kavinė", keywords: ["cafe", "restaurant"] },
  { stems: ["degalin"], label: "degalinė", keywords: ["fuel"] },
  { stems: ["bibliotek"], label: "biblioteka", keywords: ["library"] },
  { stems: ["seniunij", "savivaldyb"], label: "seniūnija", keywords: ["townhall"] },
];

/** Kategorija pagal žodžių pradžias („vaistinę“ → vaistinė), ne pagal bet kokią teksto dalį. */
export function matchCategory(text: string) {
  const words = stripDiacritics(text).split(/[^a-z0-9]+/).filter(Boolean);
  return CATEGORIES.find((c) => c.stems.some((st) => words.some((w) => w.startsWith(st))));
}

// ── Darbo laikas: OSM formatas → lietuviškai ─────────────────────────────────
const OSM_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]; // indeksas = getUTCDay()
const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_NOM: Record<string, string> = {
  Mo: "pirmadienis", Tu: "antradienis", We: "trečiadienis", Th: "ketvirtadienis",
  Fr: "penktadienis", Sa: "šeštadienis", Su: "sekmadienis", PH: "šventinės dienos",
};

/** „Mo-Fr 08:00-18:00; Sa off“ → „pirmadienis–penktadienis 8:00–18:00; šeštadienis nedirba“ */
export function translateHours(oh: string): string {
  if (/^24\/7$/.test(oh.trim())) return "visą parą, kasdien";
  return oh
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAY_NOM[d])
    .replace(/\boff\b|\bclosed\b/g, "nedirba")
    .replace(/(\d{2}):(\d{2})/g, (_, h, m) => `${+h}:${m}`)
    .replace(/(\S)-(\S)/g, "$1–$2")
    .replace(/,\s*/g, ", ");
}

/** Šiandienos darbo laikas iš paprasto OSM formato; neatpažinus null. */
export function hoursToday(oh: string, now = new Date()): string | null {
  if (/^24\/7$/.test(oh.trim())) return "dirba visą parą";
  const today = OSM_DAYS[vilniusParts(now).weekday];
  let result: string | null = null;
  for (const rule of oh.split(";").map((r) => r.trim()).filter(Boolean)) {
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)\s+(.+)$/);
    if (!m) {
      if (/^\d{2}:\d{2}/.test(rule)) result = rule; // be dienų = kasdien
      continue;
    }
    const days = new Set<string>();
    for (const part of m[1].split(",").filter(Boolean)) {
      const [a, b] = part.split("-");
      if (!b) { days.add(a); continue; }
      let i = WEEK.indexOf(a);
      const j = WEEK.indexOf(b);
      while (true) { days.add(WEEK[i]); if (i === j) break; i = (i + 1) % 7; }
    }
    if (days.has(today)) result = m[2].trim(); // vėlesnė taisyklė perrašo ankstesnę
  }
  if (result === null) return null;
  if (/^(off|closed)$/.test(result)) return "šiandien nedirba";
  return `šiandien dirba ${translateHours(result)}`;
}

// ── Pagalbinės funkcijos ──────────────────────────────────────────────────────
function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6_371_000, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function spokenDistance(m: number): string {
  if (m < 1000) return `apie ${Math.max(50, Math.round(m / 50) * 50)} metrų`;
  return `apie ${(Math.round(m / 100) / 10).toString().replace(".", ",")} km`;
}

let lastNominatim = 0;
/** Nominatim politika: ne dažniau kaip 1 užklausa per sekundę. */
async function nominatim(path: string) {
  const wait = lastNominatim + 1_050 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const r = await fetch(`${NOMINATIM}${path}&format=jsonv2&extratags=1&addressdetails=1&accept-language=lt`, {
    headers: UA, signal: AbortSignal.timeout(5_000),
  });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  // deno-lint-ignore no-explicit-any
  return await r.json() as any[];
}

/** Photon (atsarginis): atlaidi paieška; grąžina tokio pat formato objektus kaip Nominatim. */
// deno-lint-ignore no-explicit-any
async function photonFallback(query: string): Promise<any[]> {
  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lat=55.2&lon=23.9`, {
      headers: UA, signal: AbortSignal.timeout(2_500),
    });
    if (!r.ok) return [];
    const j = await r.json();
    // deno-lint-ignore no-explicit-any
    const feats = (j.features as any[]).filter((f) => f.properties.countrycode === "LT" && f.properties.osm_key !== "highway");
    if (!feats.length) return [];
    // Darbo laikas ir telefonas: Nominatim lookup pagal OSM ID
    const ids = feats.slice(0, MAX_RESULTS).map((f) => `${f.properties.osm_type}${f.properties.osm_id}`).join(",");
    return await nominatim(`/lookup?osm_ids=${ids}`);
  } catch {
    return [];
  }
}

// deno-lint-ignore no-explicit-any
function toPlace(p: any, origin?: { lat: number; lon: number }): Place {
  const a = p.address ?? {};
  const street = [a.road, a.house_number].filter(Boolean).join(" ");
  const city = a.city ?? a.town ?? a.village ?? "";
  const lat = +p.lat, lon = +p.lon;
  return {
    name: p.name || p.display_name?.split(",")[0] || "",
    address: [street, city].filter(Boolean).join(", "),
    lat, lon,
    tags: p.extratags ?? {},
    distance_m: origin ? distanceM(origin, { lat, lon }) : undefined,
  };
}

function describe(p: Place, now: Date): string {
  const hours = p.tags.opening_hours;
  const phone = p.tags.phone ?? p.tags["contact:phone"];
  const parts = [p.name];
  if (p.distance_m != null) parts.push(spokenDistance(p.distance_m));
  if (p.address) parts.push(`adresas: ${p.address}`);
  if (hours) {
    const today = hoursToday(hours, now);
    parts.push(`${today ? today + "; " : ""}darbo laikas: ${translateHours(hours)}`);
  } else {
    parts.push("darbo laiko žemėlapyje nėra");
  }
  if (phone) parts.push(`telefonas: ${phone}`);
  return parts.join(", ");
}

const placeJson = (p: Place) => ({
  name: p.name, address: p.address,
  distance: p.distance_m != null ? spokenDistance(p.distance_m) : undefined,
  opening_hours: p.tags.opening_hours ?? null,
  phone: p.tags.phone ?? p.tags["contact:phone"] ?? null,
});

// ── Pagrindinė funkcija ───────────────────────────────────────────────────────
/**
 * `query`: ko ieškoti („Halės turgus“ arba kategorija „vaistinė“, „poliklinika“).
 * `city`: miestas (nebūtina). `near`: šalia ko ieškoti („Gedimino kalnas“, „Savanorių pr. 100“).
 */
export async function findPlace(query: string, opts: { city?: string; near?: string } = {}, now = new Date()) {
  const city = opts.city ? `, ${opts.city}` : "";

  // A) Kas arti
  if (opts.near) {
    const category = matchCategory(query);
    if (!category) throw new PlaceError(`Nežinau, kokių vietų ieškoti („${query}“). Pasakykite, pvz., vaistinė, poliklinika, parduotuvė.`);

    // Nominatim adresus geriau atpažįsta su trumpiniais: „Savanorių prospektas 100“ → „Savanorių pr. 100“
    const near = opts.near
      .replace(/\bprospekt\w*/gi, "pr.").replace(/\bgatv\w*/gi, "g.").replace(/\balėj\w*/gi, "al.")
      .replace(/\bplent\w*/gi, "pl.").replace(/\baikšt\w*/gi, "a.");
    let originRaw = (await nominatim(`/search?q=${encodeURIComponent(near + city)}&countrycodes=lt&limit=1`))[0];
    if (!originRaw) originRaw = (await photonFallback(`${opts.near} ${opts.city ?? ""}`))[0];
    if (!originRaw) throw new PlaceError(`Neradau vietos „${opts.near}“. Paprašykite pasakyti gatvę ir namo numerį.`);
    const origin = { lat: +originRaw.lat, lon: +originRaw.lon };
    const d = NEARBY_BOX_DEG;
    const viewbox = `${origin.lon - d * 1.6},${origin.lat + d},${origin.lon + d * 1.6},${origin.lat - d}`;

    const found = new Map<string, Place>();
    for (const kw of category.keywords) {
      const rows = await nominatim(`/search?q=${encodeURIComponent(kw)}&viewbox=${viewbox}&bounded=1&limit=15`);
      for (const r of rows) {
        const p = toPlace(r, origin);
        if (p.name) found.set(`${r.osm_type}${r.osm_id}`, p);
      }
      if (found.size >= MAX_RESULTS * 2) break;
    }
    const places = [...found.values()].sort((a, b) => a.distance_m! - b.distance_m!).slice(0, MAX_RESULTS);
    const originName = opts.near;
    if (!places.length) throw new PlaceError(`Netoli „${originName}“ neradau: ${category.label}. Galima paieškoti internete.`);

    return {
      places: places.map(placeJson),
      message: `Artimiausios vietos (${category.label}) šalia „${originName}“: ` +
        places.map((p, i) => `${i + 1}) ${describe(p, now)}`).join("; "),
    };
  }

  // B) Konkreti vieta pagal pavadinimą
  let rows = await nominatim(`/search?q=${encodeURIComponent(query + city)}&countrycodes=lt&limit=${MAX_RESULTS}`);
  rows = rows.filter((r) => r.category !== "highway" && r.category !== "boundary");
  if (!rows.length) rows = await photonFallback(`${query} ${opts.city ?? ""}`);
  if (!rows.length) throw new PlaceError(`Žemėlapyje neradau „${query}“. Pabandykite paieškoti internete (web_search).`);
  const places = rows.slice(0, MAX_RESULTS).map((r) => toPlace(r));

  return {
    places: places.map(placeJson),
    message: "Žemėlapio duomenys (pirmas rezultatas tikriausiai tinkamiausias; jei darbo laiko nėra, ieškok internete su web_search): " +
      places.map((p, i) => `${i + 1}) ${describe(p, now)}`).join("; "),
  };
}
