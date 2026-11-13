// Orų prognozė iš Open-Meteo (nemokama, be rakto) → lietuviškas tekstas balsui.
// Veikia ir Deno (Supabase), ir Node 18+ (testams), nes naudoja tik fetch.

import { kiekis, laipsniai, laipsniuKilm, parseDay, spokenDate, stripDiacritics, vilniusDateKey } from "./lt.ts";

/** „nuo 4 iki 6 laipsnių šilumos“, „nuo 2 laipsnių šalčio iki 3 laipsnių šilumos“, „apie 5 laipsnius“ */
export function temperaturuIntervalas(min: number, max: number): string {
  const a = Math.round(min), b = Math.round(max);
  if (a === b) {
    if (a === 0) return "apie 0 laipsnių";
    const n = Math.abs(a);
    return `apie ${n} ${kiekis(n, "laipsnį", "laipsnius", "laipsnių")} ${a > 0 ? "šilumos" : "šalčio"}`;
  }
  if (a > 0 && b > 0) return `nuo ${a} iki ${laipsniuKilm(b)}`;
  if (a < 0 && b < 0) return `nuo ${Math.abs(b)} iki ${laipsniuKilm(a)}`;
  return `nuo ${laipsniuKilm(a)} iki ${laipsniuKilm(b)}`;
}

const WMO: Record<number, string> = {
  0: "giedra", 1: "daugiausia giedra", 2: "nedidelis debesuotumas", 3: "debesuota",
  45: "rūkas", 48: "rūkas su šerkšnu",
  51: "nedidelė dulksna", 53: "dulksna", 55: "smarki dulksna",
  56: "lijundra", 57: "smarki lijundra",
  61: "nedidelis lietus", 63: "lietus", 65: "smarkus lietus",
  66: "lijundra", 67: "smarki lijundra",
  71: "nedidelis sniegas", 73: "sniegas", 75: "smarkus snygis", 77: "sniego kruopos",
  80: "trumpas nedidelis lietus", 81: "lietaus prapliupimai", 82: "smarkios liūtys",
  85: "trumpas snygis", 86: "smarkus snygis",
  95: "perkūnija", 96: "perkūnija su kruša", 99: "smarki perkūnija su kruša",
};
const isSnow = (c: number) => (c >= 71 && c <= 77) || c === 85 || c === 86;
const isRain = (c: number) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;

export class WeatherError extends Error {}

type Place = { name: string; latitude: number; longitude: number };

/** Lietuviški vietininkai → vardininkas: „Kaune“ → „Kaunas“, „Šiauliuose“ → „Šiauliai“. */
function cityCandidates(city: string): string[] {
  const c = city.trim();
  const rules: [RegExp, string][] = [
    [/uose$/, "ai"], [/yje$/, "ys"], [/oje$/, "a"], [/ėje$/, "ė"], [/uje$/, "us"], [/e$/, "as"],
  ];
  const rule = rules.find(([re]) => re.test(c));
  // Pirmiausia vardininkas, tada originalas (kitaip „Kaune“ randa „Kauneliai“).
  return rule ? [c.replace(rule[0], rule[1]), c] : [c];
}

async function geocode(city: string): Promise<Place> {
  // Pirmiausia ieškome Lietuvoje (visi variantai), tik tada visame pasaulyje.
  for (const country of ["&countryCode=LT", ""]) {
    for (const name of cityCandidates(city)) {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=lt${country}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`geocoding ${r.status}`);
      const results: Place[] = (await r.json()).results ?? [];
      const exact = results.find((p) => stripDiacritics(p.name) === stripDiacritics(name));
      if (exact) return exact;
    }
  }
  // Tikslaus atitikmens nėra, imame pirmą Lietuvos rezultatą (pvz. kaimas su panašiu pavadinimu).
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1&language=lt&countryCode=LT`);
  const first = r.ok ? (await r.json()).results?.[0] : undefined;
  if (first) return first;
  throw new WeatherError(`Neradau vietovės „${city}“. Paklauskite, kuriame mieste ar netoli kokio miesto gyvena.`);
}

function advice(code: number, tMin: number, tMax: number, rainProb: number, windMax: number): string[] {
  const a: string[] = [];
  if (isRain(code) && rainProb >= 50) a.push("Pasiimkite skėtį.");
  if (tMin <= 0 && (isRain(code) || isSnow(code) || code === 48)) a.push("Gali būti slidu, vaikščiokite atsargiai.");
  if (tMax <= -10) a.push("Labai šalta, šiltai apsirenkite.");
  if (tMax >= 28) a.push("Bus karšta, gerkite daug vandens ir venkite saulės vidurdienį.");
  if (windMax >= 15) a.push("Pūs labai stiprus vėjas, geriau likti namuose.");
  else if (windMax >= 10) a.push("Pūs stiprokas vėjas.");
  return a;
}

/**
 * Orai nurodytam miestui. `day` (nebūtina): „šiandien“, „rytoj“, „antradienį“, „2026-11-20“.
 * Be dienos: dabartiniai orai + šiandienos prognozė.
 */
export async function getWeather(city: string, day?: string, now = new Date()) {
  const place = await geocode(city);

  let target = now;
  if (day) {
    const d = parseDay(day, now);
    if (!d) throw new WeatherError(`Nesupratau dienos „${day}“. Paklauskite, kurios dienos orai įdomūs.`);
    target = d;
  }

  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${place.latitude}&longitude=${place.longitude}`
    + "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max"
    + "&timezone=Europe%2FVilnius&forecast_days=16&wind_speed_unit=ms";
  const r = await fetch(url);
  if (!r.ok) throw new Error(`forecast ${r.status}`);
  const w = await r.json();

  const key = vilniusDateKey(target);
  const i = (w.daily.time as string[]).indexOf(key);
  if (i < 0) {
    throw new WeatherError("Orų prognozę galiu pasakyti tik dviem savaitėms į priekį.");
  }

  const code = w.daily.weather_code[i];
  const tMin = w.daily.temperature_2m_min[i];
  const tMax = w.daily.temperature_2m_max[i];
  const rain = w.daily.precipitation_probability_max[i] ?? 0;
  const wind = w.daily.wind_speed_10m_max[i];

  const parts: string[] = [`Orai: ${place.name}.`];
  if (key === vilniusDateKey(now) && !day) {
    const c = w.current;
    parts.push(`Dabar ${WMO[c.weather_code] ?? "permainingi orai"}, ${laipsniai(c.temperature_2m)}`
      + (Math.abs(c.apparent_temperature - c.temperature_2m) >= 3 ? `, bet jaučiasi kaip ${laipsniai(c.apparent_temperature)}.` : "."));
  }
  const when = spokenDate(target, now);
  parts.push(`${when.charAt(0).toUpperCase() + when.slice(1)}: ${WMO[code] ?? "permainingi orai"}, `
    + `temperatūra ${temperaturuIntervalas(tMin, tMax)}.`);
  if (rain >= 30 && !isRain(code) && !isSnow(code)) parts.push(`Kritulių tikimybė ${rain} procentų.`);
  parts.push(...advice(code, tMin, tMax, rain, wind));

  return {
    city: place.name,
    date: key,
    description: WMO[code] ?? "permainingi orai",
    temp_min: Math.round(tMin),
    temp_max: Math.round(tMax),
    precipitation_probability: rain,
    message: parts.join(" "),
  };
}
