// Sukuria ElevenLabs agentą „Onutė“ su įrankiais iš agent/tools.json.
// Paleisti: node scripts/create_agent.ts
// Reikia .env: ELEVENLABS_API_KEY, AGENT_SECRET. Pabaigoje į .env įrašo ELEVENLABS_AGENT_ID.
// Pastaba: kiekvienas paleidimas sukuria NAUJĄ agentą. Promptui atnaujinti naudokite update_agent.ts.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const envPath = join(root, ".env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ELEVENLABS_API_KEY || !env.AGENT_SECRET) throw new Error("Trūksta ELEVENLABS_API_KEY arba AGENT_SECRET .env faile");

const VOICE_ID = env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"; // Sarah: Mature, Reassuring
const TTS_MODEL = "eleven_v3_conversational";                      // palaiko lietuvių kalbą

async function api(path: string, body: unknown) {
  const r = await fetch(`https://api.elevenlabs.io${path}`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${text}`);
  return JSON.parse(text);
}

// 1. Promptas ir pirmoji žinutė iš agent/system_prompt.md
export function readPrompt() {
  const md = readFileSync(join(root, "agent", "system_prompt.md"), "utf8").replace(/\r\n/g, "\n");
  const [firstPart, promptPart] = md.split(/\n---\n/);
  const firstMessage = firstPart.replace(/^# .*\n/, "").trim();
  const prompt = promptPart.replace(/^\s*# .*\n/, "").trim();
  return { firstMessage, prompt };
}

async function main() {
  const { firstMessage, prompt } = readPrompt();

  // 2. Paslaptis x-agent-secret headeriui (ElevenLabs workspace secret)
  const secret = await api("/v1/convai/secrets", {
    type: "new", name: `onute_agent_secret_${Date.now()}`, value: env.AGENT_SECRET,
  });
  console.log("✓ paslaptis sukurta");

  // 3. Įrankiai
  const tools = JSON.parse(readFileSync(join(root, "agent", "tools.json"), "utf8"));
  const toolIds: string[] = [];
  for (const t of tools) {
    t.api_schema.request_headers = { "x-agent-secret": { secret_id: secret.secret_id } };
    const created = await api("/v1/convai/tools", { tool_config: t });
    toolIds.push(created.id);
    console.log(`✓ įrankis ${t.name}`);
  }

  // 4. Agentas
  const agent = await api("/v1/convai/agents/create", {
    name: "Onutė",
    conversation_config: {
      agent: {
        first_message: firstMessage,
        language: "lt",
        prompt: { prompt, tool_ids: toolIds, llm: "claude-haiku-5-5" },
      },
      tts: { model_id: TTS_MODEL, voice_id: VOICE_ID },
    },
  });
  console.log(`✓ agentas sukurtas: ${agent.agent_id}`);
  console.log(`  https://elevenlabs.io/app/agents/agents/${agent.agent_id}`);

  const envText = readFileSync(envPath, "utf8");
  writeFileSync(envPath, /^ELEVENLABS_AGENT_ID=.*$/m.test(envText)
    ? envText.replace(/^ELEVENLABS_AGENT_ID=.*$/m, `ELEVENLABS_AGENT_ID=${agent.agent_id}`)
    : envText + `\nELEVENLABS_AGENT_ID=${agent.agent_id}\n`);
  console.log("✓ ELEVENLABS_AGENT_ID įrašytas į .env");
}

if (process.argv[1]?.endsWith("create_agent.ts")) await main();
