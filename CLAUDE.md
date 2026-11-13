# Senjorų asistentas „Onutė“: instrukcijos AI įrankiams

> Šis failas identiškas `AGENTS.md` (Codex). Pakeitus vieną, atnaujinkite ir kitą.

## Projektas
Hakatono projektas: **telefoninė AI pašnekovė senjorams (70+)**. Senjoras paskambina
telefonu, ElevenLabs balso agentas „Onutė“ lietuviškai kalbasi, atsako į klausimus
(orai, data ir laikas, bendros žinios), įspėja apie sukčius ir nukreipia į pagalbą skubiu atveju.

## Architektūra
```
Skambutis → Twilio numeris → ElevenLabs Conversational AI agentas
         → "server tools" (HTTP POST) → Supabase Edge Function `assistant-tools`
                                          → Open-Meteo (orai, be rakto)
```

## Aplankų struktūra
| Aplankas | Turinys |
|---|---|
| `agent/system_prompt.md` | Onutės sistemos promptas ir pirmoji žinutė |
| `agent/tools.json` | Įrankių aprašai ElevenLabs agentui |
| `supabase/functions/assistant-tools/` | Agento įrankiai: `get_weather`, `get_current_time` |
| `supabase/functions/_shared/` | Bendri moduliai: `lt.ts` (lietuviškos datos, skaičiai), `weather.ts` |
| `scripts/` | Testai ir pagalbiniai skriptai (Node, PowerShell) |
| `agent/archyvas-registracijos/`, `supabase/functions/agent-tools/`, `supabase/migrations/` | **Archyvas:** ankstesnė registracijų versija, šiuo metu nenaudojama |

## Taisyklės
- Atsakymus komandai ir kodo komentarus rašyk **lietuviškai**. Kodo identifikatoriai angliški.
- **Niekada** nekomituok `.env` ir jokių API raktų. Naudok `.env.example`.
- Į `main` tiesiogiai nepushinti. Dirbk savo šakoje (`feat/...`) ir daryk PR.
- Prieš darbą: `git pull origin main`.
- Laikai ir datos: **Europe/Vilnius** laiko juosta.
- Windows PowerShell'e naudok `npx.cmd`, ne `npx` (execution policy).

## Įrankių principai
- Įvestis ir išvestis: JSON. Visada `ok` ir `message`. `message` yra lietuviškas tekstas, paruoštas skaityti balsu.
- Gramatika svarbi: naudok `lt.ts` pagalbininkus (`kiekis`, `laipsniai`, `spokenDate`...).
- Klaidos vartotojui per `UserError`/`WeatherError` (suprantamas tekstas), techninės klaidos tik į logus.
- Autentifikacija: header `x-agent-secret` turi sutapti su `AGENT_SECRET`.
- Naujas įrankis: pridėk į `tools` objektą `assistant-tools/index.ts`, aprašą į `agent/tools.json`, testą į `scripts/`.

## Testai
- `node scripts/test_lt.ts`: gramatika ir datos (be interneto)
- `node scripts/test_weather.ts`: gyvi orai iš Open-Meteo
