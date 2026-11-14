// Paieška internete per Firecrawl (/v2/search).
// Greita paieška (~1 s): pavadinimai ir aprašymai. `withContent`: + puslapių turinys (lėčiau).
// Veikia ir Deno (Supabase), ir Node 18+ (testams).

export class SearchError extends Error {}

const MAX_RESULTS = 4;      // atsakymas bus skaitomas balsu, daugiau nereikia
const PAGE_CHARS = 1500;    // kiek teksto imti iš puslapio (withContent)
const SNIPPET_CHARS = 300;

// Socialiniai tinklai ir agregatoriai: daug šlamšto, retai atsako į klausimą
const BLOCKED = ["facebook.com", "instagram.com", "tiktok.com", "youtube.com", "pinterest.", "x.com", "twitter.com", "reddit.com"];
const isBlocked = (url = "") => BLOCKED.some((d) => url.includes(d)) || url.includes("google.com/url");

// web rezultatai turi `description`, news rezultatai turi `snippet`
type Hit = { url?: string; title?: string; description?: string; snippet?: string; markdown?: string; date?: string };

/** Išvalo markdown: nuorodos, paveikslėliai, lentelių brūkšniai, perteklinės eilutės. */
function cleanMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[#>*\-|\s]+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * `recent`: tik naujienos (paskutinė savaitė + naujienų šaltiniai). Darbo laikui, adresams ir faktams NENAUDOTI.
 * `withContent`: ištraukia 2 geriausių puslapių turinį (~5–12 s).
 */
export async function searchWeb(query: string, apiKey: string, opts: { recent?: boolean; withContent?: boolean } = {}) {
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY nenustatytas");
  const withContent = opts.withContent ?? false;

  const body: Record<string, unknown> = {
    query: `${query} -site:facebook.com -site:instagram.com -site:tiktok.com`,
    limit: withContent ? 3 : 8,          // daugiau rezultatų, nes dalį atmesime
    sources: opts.recent ? ["news", "web"] : ["web"],
    location: "Lithuania",
    country: "LT",
    timeout: withContent ? 12_000 : 8_000,
  };
  if (opts.recent) body.tbs = "qdr:w";
  if (withContent) body.scrapeOptions = { formats: ["markdown"], onlyMainContent: true, timeout: 8_000 };

  const r = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(withContent ? 15_000 : 10_000), // ElevenLabs įrankio laukia ~20 s
  });
  if (!r.ok) throw new Error(`firecrawl ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();

  // v2: data: { web: [...], news: [...] }; v1: data: [...]
  const d = j.data ?? {};
  const hits: Hit[] = Array.isArray(d) ? d : [...(d.news ?? []), ...(d.web ?? [])];
  const seen = new Set<string>();
  const unique = hits
    .filter((h) => h.url && !isBlocked(h.url) && !seen.has(h.url) && seen.add(h.url))
    .slice(0, withContent ? 2 : MAX_RESULTS);

  if (!unique.length) {
    throw new SearchError("Internete patikimų rezultatų neradau. Pasiūlykite paklausti kitaip arba patikslinti.");
  }

  const sources = unique.map((h, i) => {
    const content = h.markdown ? cleanMarkdown(h.markdown).slice(0, PAGE_CHARS) : "";
    const snippet = cleanMarkdown(h.description || h.snippet || "").replace(/\n/g, " ").slice(0, SNIPPET_CHARS);
    let host = "";
    try { host = new URL(h.url!).hostname.replace(/^www\./, ""); } catch { /* nesvarbu */ }
    return `[${i + 1}] ${h.title ?? ""} (${host}${h.date ? `, ${h.date}` : ""})\n${snippet}${content ? `\n${content}` : ""}`;
  });

  return {
    query,
    sources: unique.map((h) => ({ title: h.title, url: h.url })),
    message:
      "Paieškos rezultatai (atsakyk senjorui trumpai, 1–3 sakiniais, savais žodžiais; " +
      "neminėk nuorodų; jei rezultatai neatsako į klausimą ar prieštarauja, taip ir pasakyk):\n\n" +
      sources.join("\n\n"),
  };
}
