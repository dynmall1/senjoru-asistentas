// Atnaujina esamo agento promptą, pirmąją žinutę ir LLM iš agent/system_prompt.md.
// Paleisti po prompto pakeitimų: node scripts/update_agent.ts
// Įrankių ir balso neliečia (juos keiskite ElevenLabs sąsajoje arba create_agent.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readPrompt } from "./create_agent.ts";

export const LLM = "claude-haiku-5-5"; // greitas, gerai kalba lietuviškai

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ELEVENLABS_AGENT_ID) throw new Error("Trūksta ELEVENLABS_AGENT_ID .env faile (pirma paleiskite create_agent.ts)");

const { firstMessage, prompt } = readPrompt();
const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${env.ELEVENLABS_AGENT_ID}`, {
  method: "PATCH",
  headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    conversation_config: { agent: { first_message: firstMessage, prompt: { prompt, llm: LLM } } },
  }),
});
if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
const a = (await r.json()).conversation_config.agent;
console.log(`✓ agentas atnaujintas | LLM: ${a.prompt.llm} | įrankių: ${a.prompt.tool_ids?.length ?? 0} | prompto ilgis: ${a.prompt.prompt.length}`);
