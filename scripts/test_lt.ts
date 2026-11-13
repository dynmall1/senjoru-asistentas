// Greiti lietuviškų pagalbininkų testai.  Paleisti: node scripts/test_lt.ts
import assert from "node:assert/strict";
import { eurai, laipsniai, normalizePhone, parseDay, spokenDateTime, spokenNow, vilniusParts } from "../supabase/functions/_shared/lt.ts";
import { temperaturuIntervalas } from "../supabase/functions/_shared/weather.ts";

// 2026-11-13 penktadienis, 12:00 Vilniaus laiku (= 10:00 UTC)
const now = new Date("2026-11-13T10:00:00Z");

assert.equal(spokenDateTime(new Date("2026-11-16T08:00:00Z"), now), "pirmadienį, lapkričio šešioliktą dieną, dešimtą valandą");
assert.equal(spokenDateTime(new Date("2026-11-14T07:30:00Z"), now), "rytoj, šeštadienį, lapkričio keturioliktą dieną, devintą valandą trisdešimt minučių");
assert.equal(spokenDateTime(new Date("2026-11-13T14:00:00Z"), now), "šiandien, penktadienį, lapkričio tryliktą dieną, šešioliktą valandą");
// Vasaros laikas (UTC+3)
assert.equal(spokenDateTime(new Date("2026-07-21T07:00:00Z"), now), "antradienį, liepos dvidešimt pirmą dieną, dešimtą valandą");

const day = (s: string) => { const d = parseDay(s, now); return d && vilniusParts(d); };
assert.deepEqual(day("rytoj"), { y: 2026, m: 11, d: 14, hour: 0, minute: 0, weekday: 6 });
assert.equal(day("Antradienį")?.d, 17);
assert.equal(day("penktadienį")?.d, 20); // šiandien penktadienis → kitas
assert.equal(day("poryt")?.d, 15);
assert.equal(day("2026-12-01")?.m, 12);
assert.equal(parseDay("kada nors", now), null);

assert.equal(normalizePhone("8 612 34567"), "+37061234567");
assert.equal(normalizePhone("+370 612 34567"), "+37061234567");
assert.equal(normalizePhone("61234567"), "+37061234567");
assert.equal(normalizePhone("0037061234567"), "+37061234567");
assert.equal(normalizePhone("123"), null);

assert.equal(eurai(1), "1 euras");
assert.equal(eurai(21), "21 euras");
assert.equal(eurai(35), "35 eurai");
assert.equal(eurai(15), "15 eurų");
assert.equal(eurai(40), "40 eurų");
assert.equal(eurai(111), "111 eurų");
assert.equal(eurai(5.5), "5,50 euro");

assert.equal(laipsniai(5), "5 laipsniai šilumos");
assert.equal(laipsniai(-1), "1 laipsnis šalčio");
assert.equal(laipsniai(-12.4), "12 laipsnių šalčio");
assert.equal(laipsniai(0.3), "0 laipsnių");
assert.equal(temperaturuIntervalas(4, 6), "nuo 4 iki 6 laipsnių šilumos");
assert.equal(temperaturuIntervalas(-5, -1), "nuo 1 iki 5 laipsnių šalčio");
assert.equal(temperaturuIntervalas(-2, 3), "nuo 2 laipsnių šalčio iki 3 laipsnių šilumos");
assert.equal(temperaturuIntervalas(-1, 1), "nuo 1 laipsnio šalčio iki 1 laipsnio šilumos");
assert.equal(temperaturuIntervalas(4.6, 5.2), "apie 5 laipsnius šilumos");
assert.equal(temperaturuIntervalas(-0.9, -1.2), "apie 1 laipsnį šalčio");
assert.match(spokenNow(now), /^Šiandien penktadienis, 2026 metų lapkričio 13 diena\. Dabar 12:00\.$/);

console.log("Visi testai praėjo ✓");
