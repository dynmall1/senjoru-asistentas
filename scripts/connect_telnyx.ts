// Prijungia Telnyx numerius prie ElevenLabs agento per SIP trunk.
// Paleisti: node scripts/connect_telnyx.ts
// Reikia .env: TELNYX_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID.
// Skriptas pakartojamas: jei kažkas jau sukurta, naudoja esamą.
//
// Schema: skambutis → Telnyx numeris → FQDN SIP connection → sip.rtc.elevenlabs.io:5060 (TCP) → Onutė
import { readFileSync } from "node:fs";
import { join } from "node:path";

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/\s/g, "")]),
);
const CONNECTION_NAME = "Onute-ElevenLabs";
const ELEVENLABS_SIP = "sip.rtc.elevenlabs.io";

async function call(base: string, auth: Record<string, string>, method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: { ...auth, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}
const tx = (m: string, p: string, b?: unknown) =>
  call("https://api.telnyx.com/v2", { Authorization: `Bearer ${env.TELNYX_API_KEY}` }, m, p, b);
const el = (m: string, p: string, b?: unknown) =>
  call("https://api.elevenlabs.io", { "xi-api-key": env.ELEVENLABS_API_KEY }, m, p, b);

// 1. Telnyx: FQDN connection į ElevenLabs
const conns = (await tx("GET", "/fqdn_connections")).data as { id: string; connection_name: string }[];
let connId = conns.find((c) => c.connection_name === CONNECTION_NAME)?.id;
if (!connId) {
  connId = (await tx("POST", "/fqdn_connections", {
    connection_name: CONNECTION_NAME,
    transport_protocol: "TCP",
    inbound: {
      ani_number_format: "+E.164",   // skambinančiojo numeris su +
      dnis_number_format: "+e164",   // ElevenLabs numerį atpažįsta su + (taip ir importuojame)
      codecs: ["G722", "G711U", "G711A"],
    },
  })).data.id;
  console.log("✓ Telnyx SIP connection sukurtas");
} else {
  console.log("✓ Telnyx SIP connection jau yra");
}

// 2. Telnyx: kur siųsti skambučius (ElevenLabs SIP serveris)
const fqdns = (await tx("GET", `/fqdns?filter[connection_id]=${connId}`)).data as { fqdn: string }[];
if (!fqdns.some((f) => f.fqdn === ELEVENLABS_SIP)) {
  await tx("POST", "/fqdns", { connection_id: connId, fqdn: ELEVENLABS_SIP, port: 5060, dns_record_type: "a" });
  console.log(`✓ nukreipta į ${ELEVENLABS_SIP}:5060 (TCP)`);
} else {
  console.log(`✓ nukreipimas į ${ELEVENLABS_SIP} jau yra`);
}

// 3. Visi paskyros numeriai: priskirti connection'ui, importuoti į ElevenLabs, priskirti Onutę
const numbers = (await tx("GET", "/phone_numbers?page[size]=50")).data as
  { id: string; phone_number: string; status: string; connection_id?: string }[];
const elNumbers = (await el("GET", "/v1/convai/phone-numbers")) as { phone_number: string; phone_number_id: string }[];

for (const n of numbers) {
  console.log(`\n${n.phone_number} (${n.status})`);
  if (n.connection_id !== connId) {
    try {
      await tx("PATCH", `/phone_numbers/${n.id}`, { connection_id: connId });
      console.log("  ✓ priskirtas SIP connection'ui");
    } catch (e) {
      console.log(`  ✗ nepavyko priskirti (dažnai dėl nepatvirtintų dokumentų): ${(e as Error).message.slice(0, 200)}`);
      continue;
    }
  } else {
    console.log("  ✓ jau priskirtas SIP connection'ui");
  }

  let phoneId = elNumbers.find((p) => p.phone_number === n.phone_number)?.phone_number_id;
  if (!phoneId) {
    phoneId = (await el("POST", "/v1/convai/phone-numbers", {
      provider: "sip_trunk",
      phone_number: n.phone_number,
      label: `Onutė (Telnyx ${n.phone_number.startsWith("+370") ? "LT" : "US"})`,
      inbound_trunk_config: { media_encryption: "allowed" },
      outbound_trunk_config: { address: "sip.telnyx.com", transport: "tcp", media_encryption: "allowed" },
    })).phone_number_id;
    console.log("  ✓ importuotas į ElevenLabs");
  } else {
    console.log("  ✓ jau importuotas į ElevenLabs");
  }
  await el("PATCH", `/v1/convai/phone-numbers/${phoneId}`, { agent_id: env.ELEVENLABS_AGENT_ID });
  console.log("  ✓ Onutė priskirta");
}
