// Prijungia Twilio numerį prie ElevenLabs agento (ElevenLabs pats sukonfigūruoja Twilio webhook'us).
// Paleisti: node scripts/connect_twilio.ts
// Reikia .env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID
// Pabaigoje į .env įrašo ELEVENLABS_PHONE_NUMBER_ID.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const envPath = join(import.meta.dirname, "..", ".env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const phone = (env.TWILIO_PHONE_NUMBER ?? "").replace(/[^\d+]/g, "");
const sid = env.TWILIO_ACCOUNT_SID, token = env.TWILIO_AUTH_TOKEN;
if (!phone || !sid || !token) throw new Error("Trūksta TWILIO_* reikšmių .env faile");

// 1. Twilio: ar raktai tinka ir ar numeris priklauso šiai paskyrai
const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
const tw = async (path: string) => {
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, { headers: { Authorization: auth } });
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${await r.text()}`);
  return r.json();
};
const account = await tw(".json");
console.log(`✓ Twilio paskyra: ${account.friendly_name} | tipas: ${account.type} | būsena: ${account.status}`);
const nums = await tw(`/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phone)}`);
if (!nums.incoming_phone_numbers?.length) throw new Error(`Numeris ${phone} nerastas šioje Twilio paskyroje`);
console.log(`✓ numeris rastas: ${phone} | balsas: ${nums.incoming_phone_numbers[0].capabilities.voice}`);

// 2. ElevenLabs: importuoti numerį (arba rasti jau importuotą) ir priskirti agentą
const el = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(`https://api.elevenlabs.io${path}`, {
    method,
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`ElevenLabs ${method} ${path} → ${r.status}: ${text}`);
  return text ? JSON.parse(text) : {};
};

const existing = (await el("GET", "/v1/convai/phone-numbers")) as { phone_number: string; phone_number_id: string }[];
let phoneId = existing.find((p) => p.phone_number === phone)?.phone_number_id;
if (phoneId) {
  console.log("✓ numeris jau importuotas į ElevenLabs");
} else {
  phoneId = (await el("POST", "/v1/convai/phone-numbers", {
    provider: "twilio", phone_number: phone, label: "Onutė", sid, token,
  })).phone_number_id;
  console.log("✓ numeris importuotas į ElevenLabs");
}
await el("PATCH", `/v1/convai/phone-numbers/${phoneId}`, { agent_id: env.ELEVENLABS_AGENT_ID });
console.log("✓ Onutė priskirta numeriui: skambučiai į jį atsiliepia Onutė");

const envText = readFileSync(envPath, "utf8");
writeFileSync(envPath, /^ELEVENLABS_PHONE_NUMBER_ID=.*$/m.test(envText)
  ? envText.replace(/^ELEVENLABS_PHONE_NUMBER_ID=.*$/m, `ELEVENLABS_PHONE_NUMBER_ID=${phoneId}`)
  : envText.replace(/\s*$/, "") + `\nELEVENLABS_PHONE_NUMBER_ID=${phoneId}\n`);
console.log(`\n📞 Skambinkite: ${phone}`);
