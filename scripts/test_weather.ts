// Gyvas orų modulio testas (kviečia Open-Meteo).  Paleisti: node scripts/test_weather.ts
import { getWeather, WeatherError } from "../supabase/functions/_shared/weather.ts";

const cases: [string, string?][] = [
  ["Vilnius"],
  ["Kaune", "rytoj"],
  ["Šiauliuose", "antradienį"],
  ["Klaipėdoje", "poryt"],
  ["Panevėžyje"],
  ["Alytus", "sekmadienį"],
  ["Londonas"],
  ["Asdfgh"],
];

for (const [city, day] of cases) {
  try {
    const w = await getWeather(city, day);
    console.log(`✓ ${city} ${day ?? ""}\n   ${w.message}`);
  } catch (e) {
    console.log(`${e instanceof WeatherError ? "✓ (laukta klaida)" : "✗"} ${city} ${day ?? ""}\n   ${(e as Error).message}`);
  }
}
