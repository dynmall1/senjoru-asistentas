// ElevenLabs agento įrankiai („server tools“).
// Viena Edge Function, įrankis parenkamas pagal URL galą:
//   POST https://<projektas>.supabase.co/functions/v1/agent-tools/<įrankis>
// Header: x-agent-secret: <AGENT_SECRET>
//
// Atsakymai visada turi `ok` ir `message`. `message` yra trumpas lietuviškas tekstas,
// kurį agentas gali perskaityti ar perfrazuoti senjorui.

import { createClient } from "npm:@supabase/supabase-js@2";
import { eurai, normalizePhone, parseDay, spokenDateTime, stripDiacritics, vilniusParts } from "./lt.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const AGENT_SECRET = Deno.env.get("AGENT_SECRET");
const MAX_OPTIONS = 3; // senjorui telefonu daugiau nei 3 variantų neperskaitysi

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-agent-secret, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Args = Record<string, unknown>;
type Result = Record<string, unknown>;

/** Klaida, kurią galima saugiai pasakyti vartotojui (ne techninė). */
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

function phoneArg(a: Args): string {
  const p = normalizePhone(String(a.phone ?? ""));
  if (!p) throw new UserError("Nepavyko atpažinti telefono numerio. Paprašykite pasakyti numerį dar kartą.");
  return p;
}

async function findClient(phone: string) {
  const { data, error } = await supabase.from("clients").select("id, full_name").eq("phone", phone).maybeSingle();
  if (error) throw error;
  return data;
}

// deno-lint-ignore no-explicit-any
function describeBooking(b: any, now = new Date()): string {
  const sl = b.slots, s = sl.services, p = s.providers;
  return `${s.name}, ${p.name}, ${p.address}, ${p.city}, ${spokenDateTime(new Date(sl.starts_at), now)}`;
}

const BOOKING_SELECT = "id, status, slots!inner(starts_at, services(name, providers(name, address, city)))";

const tools: Record<string, (a: Args) => Promise<Result>> = {
  /** Ar skambinantysis jau yra klientų bazėje? */
  async identify_client(a) {
    const c = await findClient(phoneArg(a));
    return c
      ? { found: true, full_name: c.full_name, message: `Klientas rastas: ${c.full_name}.` }
      : { found: false, message: "Klientas nerastas. Paklauskite vardo ir pavardės ir užregistruokite su register_client." };
  },

  /** Naujas klientas (arba vardo atnaujinimas). */
  async register_client(a) {
    const phone = phoneArg(a);
    const full_name = str(a, "full_name");
    if (!full_name) throw new UserError("Trūksta vardo ir pavardės.");
    const birth_year = Number(a.birth_year) || null;
    const { data, error } = await supabase
      .from("clients")
      .upsert({ phone, full_name, ...(birth_year ? { birth_year } : {}) }, { onConflict: "phone" })
      .select("full_name")
      .single();
    if (error) throw error;
    return { message: `Klientas užregistruotas: ${data.full_name}.` };
  },

  /** Paslaugų paieška pagal raktinius žodžius ir miestą. Grąžina iki 3 variantų. */
  async search_services(a) {
    const { data, error } = await supabase
      .from("services")
      .select("id, name, price_eur, providers(name, category, address, city, description)");
    if (error) throw error;

    // Lietuviškos galūnės kinta („kirpėją“, „kirpykla“), todėl lyginame žodžių pradžias.
    const words = stripDiacritics([str(a, "query"), str(a, "category")].filter(Boolean).join(" "))
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3)
      .map((w) => w.slice(0, Math.max(4, w.length - 3)));
    const city = str(a, "city") ? stripDiacritics(str(a, "city")!).slice(0, 4) : undefined;

    // deno-lint-ignore no-explicit-any
    const rows = (data ?? []) as any[];
    const matches = rows
      .map((s) => {
        const p = s.providers ?? {};
        const hay = stripDiacritics(`${s.name} ${p.name} ${p.category} ${p.description}`);
        return { s, p, score: words.filter((w) => hay.includes(w)).length };
      })
      .filter((x) => (!city || stripDiacritics(x.p.city ?? "").startsWith(city)) && (!words.length || x.score > 0))
      .sort((x, y) => y.score - x.score)
      .slice(0, MAX_OPTIONS);

    if (!matches.length) {
      const categories = [...new Set(rows.map((s) => s.providers?.category).filter(Boolean))].join(", ");
      return { results: [], message: `Tokios paslaugos neradau. Galimos sritys: ${categories}.` };
    }

    const results = matches.map(({ s, p }) => ({
      service_id: s.id,
      service: s.name,
      provider: p.name,
      address: p.address,
      city: p.city,
      price: s.price_eur == null ? "nemokamai arba kompensuojama" : eurai(Number(s.price_eur)),
    }));
    return {
      results,
      message: results.map((r, i) => `${i + 1}) ${r.service}, ${r.provider}, ${r.city}, kaina: ${r.price}`).join("; "),
    };
  },

  /** Iki 3 artimiausių laisvų laikų. `day`: „rytoj“, „antradienį“, „2026-11-20“; `part_of_day`: „rytas“/„popietė“. */
  async get_available_slots(a) {
    const service_id = str(a, "service_id");
    if (!service_id) throw new UserError("Trūksta paslaugos ID. Pirmiausia naudokite search_services.");

    const now = new Date();
    let from = now;
    let dayEnd: Date | undefined;
    const day = str(a, "day");
    if (day) {
      const d = parseDay(day, now);
      if (!d) throw new UserError(`Nesupratau dienos „${day}“. Paklauskite, kurią dieną norėtų.`);
      if (d > now) from = d;
      dayEnd = new Date(d.getTime() + 24 * 3_600_000);
    }

    const { data, error } = await supabase
      .from("slots")
      .select("id, starts_at")
      .eq("service_id", service_id)
      .eq("is_booked", false)
      .gt("starts_at", from.toISOString())
      .order("starts_at")
      .limit(60);
    if (error) throw error;

    const part = str(a, "part_of_day") ? stripDiacritics(str(a, "part_of_day")!) : "";
    const fitsPart = (iso: string) => {
      const h = vilniusParts(new Date(iso)).hour;
      if (part.startsWith("ryt")) return h < 12;
      if (part.startsWith("pop") || part.startsWith("vak") || part.startsWith("piet")) return h >= 12;
      return true;
    };

    let list = (data ?? []).filter((s) => fitsPart(s.starts_at));
    let note = "";
    if (dayEnd) {
      const sameDay = list.filter((s) => new Date(s.starts_at) < dayEnd!);
      if (sameDay.length) list = sameDay;
      else note = "Tą dieną laisvų laikų nėra. Artimiausi laisvi laikai: ";
    }

    const slots = list.slice(0, MAX_OPTIONS).map((s) => ({
      slot_id: s.id,
      spoken: spokenDateTime(new Date(s.starts_at), now),
    }));
    if (!slots.length) {
      return { slots: [], message: "Šiai paslaugai laisvų laikų nėra. Pasiūlykite kitą paslaugos teikėją." };
    }
    return { slots, message: note + slots.map((s, i) => `${i + 1}) ${s.spoken}`).join("; ") };
  },

  /** Registracija į konkretų laiką (atominė, apsaugota nuo dvigubo užsakymo). */
  async create_booking(a) {
    const phone = phoneArg(a);
    const slot_id = str(a, "slot_id");
    if (!slot_id) throw new UserError("Trūksta laiko ID. Pirmiausia naudokite get_available_slots.");

    const { data, error } = await supabase.rpc("book_slot", { p_phone: phone, p_slot_id: slot_id });
    if (error) {
      if (error.message.includes("CLIENT_NOT_FOUND")) {
        throw new UserError("Klientas dar neužregistruotas. Pirmiausia naudokite register_client.");
      }
      if (error.message.includes("SLOT_UNAVAILABLE")) {
        throw new UserError("Šis laikas ką tik buvo užimtas. Atsiprašykite ir pasiūlykite kitą laiką.");
      }
      throw error;
    }

    const booking_id = (data as { booking_id: string }).booking_id;
    const { data: b, error: e2 } = await supabase.from("bookings").select(BOOKING_SELECT).eq("id", booking_id).single();
    if (e2) throw e2;
    return { booking_id, message: `Užregistruota: ${describeBooking(b)}.` };
  },

  /** Kliento būsimos registracijos (iki 3 artimiausių). */
  async list_my_bookings(a) {
    const c = await findClient(phoneArg(a));
    if (!c) return { bookings: [], message: "Šis klientas dar neužregistruotas ir registracijų neturi." };

    const now = new Date();
    const { data, error } = await supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("client_id", c.id)
      .eq("status", "confirmed")
      .gt("slots.starts_at", now.toISOString());
    if (error) throw error;

    // deno-lint-ignore no-explicit-any
    const upcoming = ((data ?? []) as any[])
      .sort((x, y) => x.slots.starts_at.localeCompare(y.slots.starts_at))
      .slice(0, MAX_OPTIONS)
      .map((b) => ({ booking_id: b.id, spoken: describeBooking(b, now) }));
    if (!upcoming.length) return { bookings: [], message: "Būsimų registracijų nėra." };
    return { bookings: upcoming, message: upcoming.map((b, i) => `${i + 1}) ${b.spoken}`).join("; ") };
  },

  /** Registracijos atšaukimas. */
  async cancel_booking(a) {
    const phone = phoneArg(a);
    const booking_id = str(a, "booking_id");
    if (!booking_id) throw new UserError("Trūksta registracijos ID. Pirmiausia naudokite list_my_bookings.");
    const { error } = await supabase.rpc("cancel_booking", { p_phone: phone, p_booking_id: booking_id });
    if (error) {
      if (error.message.includes("BOOKING_NOT_FOUND")) throw new UserError("Tokios aktyvios registracijos neradau.");
      throw error;
    }
    return { message: "Registracija atšaukta." };
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
  } catch { /* tuščias body, įrankis pats praneš, ko trūksta */ }

  try {
    return json({ ok: true, ...(await tools[name](args)) });
  } catch (e) {
    if (e instanceof UserError) return json({ ok: false, message: e.message });
    console.error(`[${name}]`, e);
    return json({ ok: false, message: "Įvyko techninė klaida. Atsiprašykite ir pasiūlykite paskambinti vėliau." });
  }
});
