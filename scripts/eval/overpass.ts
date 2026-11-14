// Overpass: tiksliausias „kas arti“ šaltinis (visi OSM objektai aplink tašką).
// Naudojamas tik vertinimui (teisingiems atsakymams), nes viešas serveris dažnai perkrautas.
const UA = { "User-Agent": "senjoru-asistentas/1.0 (hackathon evaluation)" };
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export type OsmPlace = { id: string; name: string; lat: number; lon: number; tags: Record<string, string>; d: number };

const R = 6371000, rad = (v: number) => (v * Math.PI) / 180;
export const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.round(2 * R * Math.asin(Math.sqrt(
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2,
  )));

/** filter pvz. '[shop~"^(supermarket|convenience)$"]' */
export async function overpassNearby(lat: number, lon: number, filter: string, radius = 1500): Promise<OsmPlace[]> {
  const q = `[out:json][timeout:25];nwr(around:${radius},${lat},${lon})${filter}[name];out center tags;`;
  let lastErr = "";
  for (const ep of ENDPOINTS) {
    try {
      const r = await fetch(ep, {
        method: "POST",
        headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) { lastErr = `${ep} ${r.status}`; continue; }
      const j = await r.json();
      // deno-lint-ignore no-explicit-any
      return (j.elements as any[]).map((e) => {
        const p = { lat: e.lat ?? e.center.lat, lon: e.lon ?? e.center.lon };
        return { id: `${e.type[0].toUpperCase()}${e.id}`, name: e.tags.name, ...p, tags: e.tags, d: dist({ lat, lon }, p) };
      }).sort((a, b) => a.d - b.d);
    } catch (e) {
      lastErr = `${ep} ${(e as Error).message}`;
    }
  }
  throw new Error(`Overpass nepasiekiamas: ${lastErr}`);
}
