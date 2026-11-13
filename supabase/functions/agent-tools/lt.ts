// Lietuviški pagalbininkai: datos ir laikai balsui, dienų atpažinimas, telefono numeriai.
// Gryni funkcijos be priklausomybių, todėl veikia ir Deno (Supabase), ir Node (testams).

export const TZ = "Europe/Vilnius";

const ORDINALS = [
  "", "pirmą", "antrą", "trečią", "ketvirtą", "penktą", "šeštą", "septintą", "aštuntą",
  "devintą", "dešimtą", "vienuoliktą", "dvyliktą", "tryliktą", "keturioliktą", "penkioliktą",
  "šešioliktą", "septynioliktą", "aštuonioliktą", "devynioliktą", "dvidešimtą",
];
const MONTHS_GEN = [
  "sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio",
  "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio",
];
// Indeksas = Date.getUTCDay() (0 = sekmadienis)
const WEEKDAYS_ACC = [
  "sekmadienį", "pirmadienį", "antradienį", "trečiadienį", "ketvirtadienį", "penktadienį", "šeštadienį",
];
const WEEKDAY_STEMS = ["sekmad", "pirmad", "antrad", "treciad", "ketvirtad", "penktad", "sestad"];
const MINUTES: Record<number, string> = {
  15: "penkiolika minučių",
  30: "trisdešimt minučių",
  45: "keturiasdešimt penkias minutes",
};

/** 1–31 → „pirmą“, „dvidešimt antrą“ ir t.t. (galininkas, moteriška giminė) */
export function ordinal(n: number): string {
  if (n >= 1 && n <= 20) return ORDINALS[n];
  if (n > 20 && n < 30) return `dvidešimt ${ORDINALS[n - 20]}`;
  if (n === 30) return "trisdešimtą";
  if (n === 31) return "trisdešimt pirmą";
  return String(n);
}

/** Pašalina diakritikus ir sumažina raides: „Kirpėją“ → „kirpeja“ */
export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Datos dalys Vilniaus laiku. */
export function vilniusParts(date: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  const y = +p.year, m = +p.month, d = +p.day;
  return { y, m, d, hour: +p.hour, minute: +p.minute, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

const dayNumber = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / 86_400_000);

/** Vilniaus vidurnaktis nurodytai datai (kaip UTC Date). */
export function vilniusMidnight(y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d);
  const p = vilniusParts(new Date(guess));
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute) - guess;
  return new Date(guess - offset);
}

/** „rytoj, ketvirtadienį, lapkričio keturioliktą dieną, dešimtą valandą“ */
export function spokenDateTime(date: Date, now = new Date()): string {
  const t = vilniusParts(date);
  const n = vilniusParts(now);
  const diff = dayNumber(t.y, t.m, t.d) - dayNumber(n.y, n.m, n.d);
  const rel = diff === 0 ? "šiandien, " : diff === 1 ? "rytoj, " : diff === 2 ? "poryt, " : "";
  const day = `${WEEKDAYS_ACC[t.weekday]}, ${MONTHS_GEN[t.m - 1]} ${ordinal(t.d)} dieną`;
  const hour = t.hour >= 1 && t.hour <= 23 ? `${ordinal(t.hour)} valandą` : `${t.hour} val.`;
  const min = t.minute ? ` ${MINUTES[t.minute] ?? `${t.minute} min.`}` : "";
  return `${rel}${day}, ${hour}${min}`;
}

/**
 * Atpažįsta dieną: „šiandien“, „rytoj“, „poryt“, savaitės dieną („antradienį“)
 * arba ISO datą „2026-11-20“. Grąžina tos dienos Vilniaus vidurnaktį arba null.
 */
export function parseDay(input: string, now = new Date()): Date | null {
  const s = stripDiacritics(input);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return vilniusMidnight(+iso[1], +iso[2], +iso[3]);

  const n = vilniusParts(now);
  let add: number | null = null;
  if (s.startsWith("siandien")) add = 0;
  else if (s.startsWith("rytoj")) add = 1;
  else if (s.startsWith("poryt")) add = 2;
  else {
    const i = WEEKDAY_STEMS.findIndex((w) => s.includes(w));
    if (i >= 0) add = (i - n.weekday + 7) % 7 || 7; // ta pati diena → kita savaitė
  }
  if (add === null) return null;
  const base = new Date(Date.UTC(n.y, n.m - 1, n.d + add));
  return vilniusMidnight(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

/** 1 euras, 2–9 eurai, 10–20 ir apvalūs eurų, trupmeninės sumos „euro“. */
export function eurai(amount: number): string {
  if (!Number.isInteger(amount)) return `${amount.toFixed(2).replace(".", ",")} euro`;
  const last2 = amount % 100, last = amount % 10;
  const word = (last2 >= 10 && last2 <= 20) || last === 0 ? "eurų" : last === 1 ? "euras" : "eurai";
  return `${amount} ${word}`;
}

/** „8 612 34567“, „+370 612 34567“, „61234567“ → „+37061234567“; neatpažinus null. */
export function normalizePhone(raw: string): string | null {
  let s = raw.replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) return s.length >= 9 ? s : null;
  if (s.startsWith("370") && s.length === 11) return "+" + s;
  if (s.startsWith("8") && s.length === 9) return "+370" + s.slice(1);
  if (s.length === 8) return "+370" + s;
  return null;
}
