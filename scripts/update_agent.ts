// Atnaujina esamo agento promptą, pirmąją žinutę, LLM ir greičio/trukmės nustatymus.
// Paleisti po prompto ar nustatymų pakeitimų: node scripts/update_agent.ts
// Įrankius sinchronizuoja sync_tools.ts, balsą keiskite ElevenLabs sąsajoje.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readPrompt } from "./create_agent.ts";

// ── Nustatymai ────────────────────────────────────────────────────────────────
// LLM sudaro tik ~2 % pokalbio kainos; kreditus daugiausia „valgo“ pokalbio minutės.
export const LLM = "claude-haiku-5-5";
const SETTINGS = {
  tts: {
    speed: 1.05,                  // šiek tiek gyviau (1.0 = normalu, ribos 0.7–1.2)
  },
  turn: {
    turn_eagerness: "normal",     // senjorai daro pauzes; "eager" juos pertrauktų
    silence_end_call_timeout: 30, // padeda ragelį po 30 s tylos (taupo kreditus)
    soft_timeout_config: {        // jei atsakymas vėluoja, Onutė pasako „Mhm...“, kad nebūtų tylos
      timeout_seconds: 2,
      message: "Mhm...",
    },
  },
  conversation: {
    max_duration_seconds: 300,    // max 5 min. per hakatoną (taupo kreditus); demo galima didinti
  },
};
// ──────────────────────────────────────────────────────────────────────────────

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
    conversation_config: {
      agent: { first_message: firstMessage, prompt: { prompt, llm: LLM } },
      ...SETTINGS,
    },
  }),
});
if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
const c = (await r.json()).conversation_config;
console.log(`✓ agentas atnaujintas | LLM: ${c.agent.prompt.llm} | įrankių: ${c.agent.prompt.tool_ids?.length ?? 0}`);
console.log(`  greitis: ${c.tts.speed} | tyla→padėti: ${c.turn.silence_end_call_timeout}s | „Mhm“ po: ${c.turn.soft_timeout_config.timeout_seconds}s | max trukmė: ${c.conversation.max_duration_seconds}s`);
