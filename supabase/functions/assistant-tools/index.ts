// Pokalbių asistento „Onutė“ įrankiai ElevenLabs agentui („server tools“).
//   POST https://<projektas>.supabase.co/functions/v1/assistant-tools/<įrankis>
//   Header: x-agent-secret: <AGENT_SECRET>
// Atsakymai visada turi `ok` ir `message` (lietuviškas tekstas, paruoštas skaityti balsu).

import { spokenNow } from "../_shared/lt.ts";
import { getWeather, WeatherError } from "../_shared/weather.ts";

const AGENT_SECRET = Deno.env.get("AGENT_SECRET");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-agent-secret, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Args = Record<string, unknown>;
type Result = Record<string, unknown>;

class UserError extends Error {}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });

function str(a: Args, key: string): string | undefined {
  const v = a[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

const tools: Record<string, (a: Args) => Promise<Result>> = {
  /** Orai: dabar + šiandien, arba nurodytai dienai (iki 16 dienų į priekį). */
  async get_weather(a) {
    const city = str(a, "city");
    if (!city) throw new UserError("Nežinau miesto. Paklauskite, kuriame mieste žmogus gyvena.");
    try {
      return await getWeather(city, str(a, "day"));
    } catch (e) {
      if (e instanceof WeatherError) throw new UserError(e.message);
      throw e;
    }
  },

  /** Šiandienos data, savaitės diena ir laikas (Vilniaus laiku). */
  get_current_time() {
    return Promise.resolve({ message: spokenNow() });
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!AGENT_SECRET || req.headers.get("x-agent-secret") !== AGENT_SECRET) {
    return json({ ok: false, message: "Neautorizuota" }, 401);
  }
  if (req.method !== "POST") return json({ ok: false, message: "Naudokite POST" }, 405);

  const name = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (!Object.hasOwn(tools, name)) {
    return json({ ok: false, message: `Nežinomas įrankis: ${name}`, available: Object.keys(tools) }, 404);
  }

  let args: Args = {};
  try {
    args = await req.json();
  } catch { /* tuščias body */ }

  try {
    return json({ ok: true, ...(await tools[name](args)) });
  } catch (e) {
    if (e instanceof UserError) return json({ ok: false, message: e.message });
    console.error(`[${name}]`, e);
    return json({ ok: false, message: "Šiuo metu nepavyko gauti informacijos. Atsiprašykite ir pasiūlykite paklausti vėliau." });
  }
});
