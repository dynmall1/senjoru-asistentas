// Sinchronizuoja agent/tools.json su esamu ElevenLabs agentu:
// atnaujina esamus įrankius (pagal pavadinimą), sukuria trūkstamus ir prijungia prie agento.
// Paleisti: node scripts/sync_tools.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const agentId = env.ELEVENLABS_AGENT_ID;
if (!agentId) throw new Error("Trūksta ELEVENLABS_AGENT_ID .env faile");

async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(`https://api.elevenlabs.io${path}`, {
    method,
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const agent = await api("GET", `/v1/convai/agents/${agentId}`);
const toolIds: string[] = agent.conversation_config.agent.prompt.tool_ids ?? [];

// Esami agento įrankiai: pavadinimas → id, ir paslapties id iš headerio
const existing = new Map<string, string>();
let secretId: string | undefined;
for (const id of toolIds) {
  const t = await api("GET", `/v1/convai/tools/${id}`);
  existing.set(t.tool_config.name, id);
  secretId ??= t.tool_config.api_schema?.request_headers?.["x-agent-secret"]?.secret_id;
}
if (!secretId) {
  secretId = (await api("POST", "/v1/convai/secrets", {
    type: "new", name: `onute_agent_secret_${Date.now()}`, value: env.AGENT_SECRET,
  })).secret_id;
}

const wanted = JSON.parse(readFileSync(join(root, "agent", "tools.json"), "utf8"));
const newIds: string[] = [];
for (const t of wanted) {
  t.api_schema.request_headers = { "x-agent-secret": { secret_id: secretId } };
  const id = existing.get(t.name);
  if (id) {
    await api("PATCH", `/v1/convai/tools/${id}`, { tool_config: t });
    newIds.push(id);
    console.log(`↻ atnaujintas ${t.name}`);
  } else {
    newIds.push((await api("POST", "/v1/convai/tools", { tool_config: t })).id);
    console.log(`＋ sukurtas ${t.name}`);
  }
}

await api("PATCH", `/v1/convai/agents/${agentId}`, {
  conversation_config: { agent: { prompt: { tool_ids: newIds } } },
});
console.log(`✓ agentui prijungta įrankių: ${newIds.length}`);
