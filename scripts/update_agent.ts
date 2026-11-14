// Atnaujina esamo agento promptą, pirmąją žinutę, LLM ir greičio/trukmės nustatymus.
// Paleisti po prompto ar nustatymų pakeitimų: node scripts/update_agent.ts
// Įrankius sinchronizuoja sync_tools.ts, balsą keiskite ElevenLabs sąsajoje.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readPrompt } from "./create_agent.ts";

// ── Nustatymai ────────────────────────────────────────────────────────────────
// LLM sudaro tik ~2 % pokalbio kainos; kreditus daugiausia „valgo“ pokalbio minutės.
// LLM istorija (126 s skambutis):
//   claude-haiku-5-5:  ~10–20 kreditų, bet lietuviškai darė gramatikos klaidų
//   claude-sonnet-5-5: 478 kreditai (~1/3 skambučio kainos!), per brangu
//   eval_llm.ts (3 scenarijai, 2026-11-14): gemini-3.6-flash 3/3, švariausia kalba, trumpi atsakymai,
//   pats pasitikslino adresą; gemini-3.5-flash 3/3; sonnet 3/3 (brangus); haiku 3/3 (smulkios klaidos); gpt-5.4-mini 1/3
export const LLM = "gemini-3.6-flash";
const SETTINGS = {
  tts: {
    // v2: v4_turbo (naujesnis, palaiko LT) vietoj v3_conversational, kuris „strigdavo“.
    // Grįžti: model_id "eleven_v3_conversational", expressive_mode true (arba naudoti atsarginį agentą).
    model_id: "eleven_v4_turbo",
    expressive_mode: false,       // be [happy]/[slow] žymių: jos darė balsą nelygų
    stability: 0.6,               // stabilesnis, lygesnis balsas (0.5 buvo)
    speed: 1.05,                  // šiek tiek gyviau (1.0 = normalu, ribos 0.7–1.2)
  },
  turn: {
    turn_eagerness: "normal",     // senjorai daro pauzes; "eager" juos pertrauktų
    silence_end_call_timeout: 30, // padeda ragelį po 30 s tylos (taupo kreditus)
    turn_timeout: 20,             // 7 s buvo per mažai: po trumpos tylos klausdavo „Ar vis dar mane girdite?“
    soft_timeout_config: {        // išjungta: „Mhm...“ įsiterpdavo prieš atsakymus; įrankiai patys sako „Akimirką“
      timeout_seconds: -1,
      message: "Mhm...",
    },
  },
  vad: {
    background_voice_detection: true, // ignoruoja foninius balsus ir muziką (pvz. hakatono salėje)
  },
  asr: {
    // Žodžiai, kuriuos kalbos atpažinimas dažnai iškraipo (vardai, trumpiniai, vietos)
    keywords: [
      "Onutė", "Onute", "Onutės",
      "ISM", "VU", "KTU", "VDU", "LSMU", "VILNIUS TECH", "Mykolo Romerio",
      "poliklinika", "vaistinė", "Santaros klinikos", "Kauno klinikos",
      "Akropolis", "Maxima", "Iki", "Rimi", "Lidl", "Norfa", "Halės turgus", "Urmo bazė",
      "Žalgiris", "LRT", "Sodra", "seniūnija",
    ],
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
console.log(`  TTS: ${c.tts.model_id} | expressive: ${c.tts.expressive_mode} | stabilumas: ${c.tts.stability}`);
console.log(`  foninių balsų filtras: ${c.vad.background_voice_detection} | ASR raktažodžiai: ${c.asr.keywords.join(", ")}`);
console.log(`  greitis: ${c.tts.speed} | tyla→padėti: ${c.turn.silence_end_call_timeout}s | „Mhm“ po: ${c.turn.soft_timeout_config.timeout_seconds}s | tylos riba: ${c.turn.turn_timeout}s | max trukmė: ${c.conversation.max_duration_seconds}s`);
