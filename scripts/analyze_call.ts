// Paskutinio (arba nurodyto) pokalbio analizė: vėlavimai, įrankiai, kaina.
// Paleisti: node scripts/analyze_call.ts [conversation_id]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const get = async (p: string) => {
  const r = await fetch(`https://api.elevenlabs.io${p}`, { headers: { "xi-api-key": env.ELEVENLABS_API_KEY } });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
};

let id = process.argv[2];
if (!id) {
  const list = await get(`/v1/convai/conversations?agent_id=${env.ELEVENLABS_AGENT_ID}&page_size=10`);
  id = list.conversations.find((c: { status: string }) => c.status === "done")?.conversation_id;
  if (!id) throw new Error("Baigtų pokalbių nėra");
}
const c = await get(`/v1/convai/conversations/${id}`);
const ch = c.metadata.charging ?? {};
console.log(`Pokalbis ${id} | ${c.metadata.call_duration_secs} s | kreditai: skambutis ${ch.call_charge}, LLM ${ch.llm_charge}`);

const delays: number[] = [];
for (const t of c.transcript) {
  const m = t.conversation_turn_metrics?.metrics ?? {};
  const s = (k: string) => m[k]?.elapsed_time;
  const tools = (t.tool_calls ?? []).map((x: { tool_name: string }) => x.tool_name).join(",");
  const toolLat = (t.tool_results ?? []).map((x: { tool_latency_secs: number }) => x.tool_latency_secs?.toFixed(1)).join(",");
  const total = s("convai_ttf_audio_since_silence");
  if (t.role === "agent" && total != null && t.time_in_call_secs > 0) delays.push(total);
  const info = t.role === "agent" && total != null
    ? `⏱ ${total.toFixed(1)}s (laukta ${s("convai_turn_silence_before_initiation")?.toFixed(1)} + LLM ${s("convai_llm_service_ttfb")?.toFixed(1)} + TTS ${s("convai_tts_service_ttfb")?.toFixed(1)})`
    : "";
  console.log(`${t.role === "agent" ? "Onutė " : "Žmogus"} ${String(t.time_in_call_secs).padStart(3)}s ${tools ? `🔧${tools}(${toolLat}s) ` : ""}${info}\n        ${(t.message ?? "").slice(0, 140)}`);
}
if (delays.length) {
  console.log(`\nVidutinis atsakymo laikas: ${(delays.reduce((a, b) => a + b, 0) / delays.length).toFixed(2)} s`);
}
