# Senjorų asistentas: instrukcijos AI įrankiams

> Šis failas identiškas `AGENTS.md` (Codex). Pakeitus vieną, atnaujinkite ir kitą.

## Projektas
Hakatono projektas: **telefoninis AI asistentas senjorams (70+)**. Senjoras paskambina
telefonu, ElevenLabs balso agentas lietuviškai padeda rasti paslaugą ir
užsiregistruoti (gydytojas, kirpykla, socialinis darbuotojas, transportas ir pan.).
Darbuotojai registracijas mato admin panelėje realiu laiku.

## Architektūra
```
Skambutis → Twilio numeris → ElevenLabs Conversational AI agentas
         → "server tools" (HTTP POST) → Supabase Edge Functions → Supabase Postgres
Admin panelė (Lovable, atskiras repo) ← Supabase realtime
Firecrawl → paslaugų teikėjų duomenys → DB + agento žinių bazė
```

## Aplankų struktūra
| Aplankas | Turinys | Atsakingas |
|---|---|---|
| `supabase/migrations/` | DB schema (SQL migracijos) | backend |
| `supabase/functions/` | Edge Functions = agento įrankiai (Deno, TypeScript) | backend |
| `supabase/seed.sql` | Demo duomenys | backend |
| `agent/` | ElevenLabs sistemos promptas, `tools.json`, žinių bazė | agentas |
| `scripts/` | Firecrawl skreiperis, pagalbiniai skriptai (Node, TypeScript) | duomenys |

Frontend (admin panelė) kuriamas **Lovable** ir yra **atskirame repo**. Čia jo nėra.

## Taisyklės
- Atsakymus komandai ir kodo komentarus rašyk **lietuviškai**. Kodo identifikatoriai angliški.
- **Niekada** nekomituok `.env` ir jokių API raktų. Naudok `.env.example`.
- Į `main` tiesiogiai nepushinti. Dirbk savo šakoje (`feat/...`) ir daryk PR.
- Prieš darbą: `git pull origin main`.
- Dirbk tik savo aplanke. Jei reikia keisti kito žmogaus dalį, pirmiau pasakyk.
- Kiekviena DB pakeitimų grupė eina į naują migracijos failą. Senų migracijų neredaguok.
- Laikai ir datos: **Europe/Vilnius** laiko juosta.

## Agento įrankių (Edge Functions) principai
- Įvestis ir išvestis: JSON. Atsakymai trumpi, nes juos agentas perskaito balsu.
- Daugiausia **3 variantai** viename atsakyme, nes senjorui telefonu daugiau neperskaitysi.
- Datoms ir laikams pridėk laukelį `spoken`, pvz. `"rytoj, lapkričio 14 d., 10 val."`.
- Klaidų tekstai lietuviškai, suprantami žmogui.
- Autentifikacija: header `x-agent-secret` turi sutapti su `AGENT_SECRET`.
- Registracija turi būti atominė (apsauga nuo dvigubo to paties laiko užsakymo).

## Agento elgsena (senjorams)
Lėtai, trumpais sakiniais, vienas klausimas vienu metu, kreipiasi „Jūs“. Prieš
registruodamas visada pakartoja paslaugą, vietą, datą ir laiką ir klausia „Ar teisingai?“.
Niekada neklausia asmens kodo ar banko duomenų.
