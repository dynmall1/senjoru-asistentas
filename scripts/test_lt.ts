// Greiti lietuviškų pagalbininkų testai.  Paleisti: node scripts/test_lt.ts
import assert from "node:assert/strict";
import { eurai, normalizePhone, parseDay, spokenDateTime, vilniusParts } from "../supabase/functions/agent-tools/lt.ts";

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

console.log("Visi testai praėjo ✓");
