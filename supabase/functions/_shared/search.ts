// Paieška internete per Firecrawl (/v2/search): rezultatai + trumpas pagrindinių puslapių turinys.
// Grąžina tekstą, iš kurio agentas (LLM) suformuluoja atsakymą senjorui.
// Veikia ir Deno (Supabase), ir Node 18+ (testams).

export class SearchError extends Error {}

const MAX_RESULTS = 4;      // daugiau nereikia: atsakymas bus skaitomas balsu
const PAGE_CHARS = 1500;    // kiek teksto imti iš kiekvieno puslapio
const SNIPPET_CHARS = 300;

// web rezultatai turi `description`, news rezultatai turi `snippet`
type Hit = { url?: string; title?: string; description?: string; snippet?: string; markdown?: string; date?: string };

/** Išvalo markdown: nuorodos, paveikslėliai, lentelių brūkšniai, perteklinės eilutės. */
function cleanMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")          // paveikslėliai
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")        // nuorodos → tekstas
    .replace(/^[#>*\-|\s]+/gm, "")                  // markdown žymės eilučių pradžioje
    .replace(/\|/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Greita paieška (~1 s): tik pavadinimai ir aprašymai.
 * `withContent: true` papildomai ištraukia puslapių turinį (~10 s): tik kai trumpų aprašymų neužtenka.
 */
export async function searchWeb(query: string, apiKey: string, opts: { recent?: boolean; withContent?: boolean } = {}) {
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY nenustatytas");
  const withContent = opts.withContent ?? false;

  const body: Record<string, unknown> = {
    query,
    limit: MAX_RESULTS,
    sources: ["web", "news"],
    location: "Lithuania",
    country: "LT",
    timeout: 20_000,
  };
  if (opts.recent) body.tbs = "qdr:w"; // tik paskutinės savaitės rezultatai
  if (withContent) body.scrapeOptions = { formats: ["markdown"], onlyMainContent: true };

  const r = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) throw new Error(`firecrawl ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();

  // v2: data: { web: [...], news: [...] }; v1: data: [...]
  const d = j.data ?? {};
  const hits: Hit[] = Array.isArray(d) ? d : [...(d.news ?? []), ...(d.web ?? [])];
  const seen = new Set<string>();
  const unique = hits.filter((h) => h.url && !seen.has(h.url) && seen.add(h.url)).slice(0, MAX_RESULTS);

  if (!unique.length) {
    throw new SearchError("Internete nieko neradau. Pasiūlykite paklausti kitaip.");
  }

  const sources = unique.map((h, i) => {
    const content = h.markdown ? cleanMarkdown(h.markdown).slice(0, PAGE_CHARS) : "";
    const snippet = cleanMarkdown(h.description || h.snippet || "").replace(/\n/g, " ").slice(0, SNIPPET_CHARS);
    return `[${i + 1}] ${h.title ?? ""}${h.date ? ` (${h.date})` : ""}\n${snippet}${content ? `\n${content}` : ""}`;
  });

  return {
    query,
    sources: unique.map((h) => ({ title: h.title, url: h.url })),
    message:
      "Paieškos rezultatai (atsakyk senjorui trumpai, 1–3 sakiniais, savais žodžiais; " +
      "neminėk nuorodų ir svetainių adresų; jei rezultatai prieštarauja ar neatsako į klausimą, taip ir pasakyk):\n\n" +
      sources.join("\n\n"),
  };
}
