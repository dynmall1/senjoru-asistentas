// Atsarginiam agentui sukuria atskiras įrankių kopijas iš git žymos v1-atsargine,
// kad sync_tools.ts (pagrindinio agento atnaujinimai) jų nebekeistų.
// Paleisti: node scripts/freeze_backup_tools.ts
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const backupId = env.ELEVENLABS_BACKUP_AGENT_ID;
if (!backupId) throw new Error("Trūksta ELEVENLABS_BACKUP_AGENT_ID .env faile");

const api = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(`https://api.elevenlabs.io${path}`, {
    method, headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${t}`);
  return t ? JSON.parse(t) : {};
};

// Paslapties ID paimame iš esamo atsarginio agento įrankio
const agent = await api("GET", `/v1/convai/agents/${backupId}`);
const firstTool = await api("GET", `/v1/convai/tools/${agent.conversation_config.agent.prompt.tool_ids[0]}`);
const secretId = firstTool.tool_config.api_schema.request_headers["x-agent-secret"].secret_id;

const v1Tools = JSON.parse(execSync("git show v1-atsargine:agent/tools.json", { cwd: root, encoding: "utf8" }));
const ids: string[] = [];
for (const t of v1Tools) {
  t.api_schema.request_headers = { "x-agent-secret": { secret_id: secretId } };
  ids.push((await api("POST", "/v1/convai/tools", { tool_config: t })).id);
  console.log(`＋ v1 kopija: ${t.name}`);
}
await api("PATCH", `/v1/convai/agents/${backupId}`, { conversation_config: { agent: { prompt: { tool_ids: ids } } } });
console.log(`✓ atsarginis agentas dabar turi savo ${ids.length} įrankius (nebesidalina su pagrindiniu)`);
