# Senjorų asistentas 📞

Telefoninis AI asistentas senjorams: paskambink ir lietuviškai užsiregistruok paslaugai.

## Pradžia komandos nariui
```powershell
git clone https://github.com/dynmall1/senjoru-asistentas.git
cd senjoru-asistentas
copy .env.example .env      # užpildykite raktus (gausite iš komandos privačiai)
git checkout -b feat/jusu-dalis
claude                      # arba codex
```

## Darbo ciklas
```powershell
git pull origin main
# ... darbas ...
git add .
git commit -m "Ką padarėte"
git push -u origin feat/jusu-dalis
# GitHub'e: Compare & pull request → Merge
```

## Rolės
| Kas | Ką daro | Kur |
|---|---|---|
| A | Admin panelė | Lovable (atskiras repo) |
| B | DB ir agento įrankiai | `supabase/` |
| C | ElevenLabs agentas, Twilio | `agent/` |
| D | Firecrawl duomenys, seed | `scripts/` |
| E | Pitch, HeyGen, Screen Studio | — |

Daugiau informacijos: `CLAUDE.md`.

## Backend diegimas (Supabase)
Reikia: Supabase projekto (supabase.com, nemokamas planas).

Projektas: `mrbtpaxkxtjabacvbzta` (jau įdiegtas). Windows PowerShell'e naudokite `npx.cmd` vietoj `npx`.

```powershell
npx.cmd supabase login                                    # atskirame lange, prašys kodo
npx.cmd supabase link --project-ref mrbtpaxkxtjabacvbzta
npx.cmd supabase db push --remote --include-seed --yes    # schema + demo duomenys
npx.cmd supabase secrets set AGENT_SECRET=<paslaptis> --yes
npx.cmd supabase functions deploy agent-tools --no-verify-jwt --yes
```

### Įrankių testavimas
```powershell
$h = @{ "x-agent-secret" = "<AGENT_SECRET>" }
$u = "https://<ref>.supabase.co/functions/v1/agent-tools"
irm "$u/identify_client"     -Method Post -Headers $h -ContentType "application/json" -Body '{"phone":"+37060000000"}'
irm "$u/search_services"     -Method Post -Headers $h -ContentType "application/json" -Body '{"query":"kirpimas","city":"Vilnius"}'
irm "$u/get_available_slots" -Method Post -Headers $h -ContentType "application/json" -Body '{"service_id":"<id iš paieškos>","day":"rytoj"}'
```
Visos pokalbio eigos testas (naudoja `.env`):
`powershell -ExecutionPolicy Bypass -File scripts\test_tools.ps1`

Lietuviškų datų ir kainų testai: `node scripts/test_lt.ts`

## ElevenLabs agentas
1. ElevenLabs → Agents → Create agent.
2. **First message** ir **System prompt**: iš `agent/system_prompt.md`.
3. Kalba: lietuvių. Balsas: ramus, šiltas moters balsas.
4. **Tools** → Add tool → Webhook: kiekvienam įrankiui iš `agent/tools.json` (URL `PROJEKTAS` pakeiskite savo ref, header `x-agent-secret` įrašykite kaip secret).
5. **Phone numbers** → Twilio numerio prijungimas.

## Agento įrankiai
| Įrankis | Ką daro |
|---|---|
| `identify_client` | Atpažįsta skambinantįjį pagal numerį |
| `register_client` | Naujas klientas |
| `search_services` | Paslaugų paieška (iki 3 variantų) |
| `get_available_slots` | Laisvi laikai („rytoj“, „antradienį“, „rytas“/„popietė“) |
| `create_booking` | Registracija (atominė, be dvigubų užsakymų) |
| `list_my_bookings` | Kliento registracijos |
| `cancel_booking` | Atšaukimas |
