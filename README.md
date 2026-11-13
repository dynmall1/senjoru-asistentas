# Onutė 📞: telefoninė pašnekovė senjorams

Senjoras paskambina, o AI pašnekovė „Onutė“ lietuviškai kalbasi, pasako orus, datą ir laiką,
atsako į klausimus ir įspėja apie sukčius.

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

## Įrankiai (Supabase Edge Function `assistant-tools`)
| Įrankis | Ką daro |
|---|---|
| `get_weather` | Orai mieste dabar arba nurodytą dieną („rytoj“, „šeštadienį“), su patarimais |
| `get_current_time` | Šiandienos data, savaitės diena, laikas |

Supabase projektas: `mrbtpaxkxtjabacvbzta`. Windows PowerShell'e naudokite `npx.cmd`.

```powershell
npx.cmd supabase login                                    # atskirame lange, prašys kodo
npx.cmd supabase link --project-ref mrbtpaxkxtjabacvbzta
npx.cmd supabase secrets set AGENT_SECRET=<paslaptis> --yes
npx.cmd supabase functions deploy assistant-tools --no-verify-jwt --yes
```

### Testai
```powershell
node scripts/test_lt.ts          # gramatika, datos
node scripts/test_weather.ts     # gyvi orai
powershell -ExecutionPolicy Bypass -File scripts\test_assistant.ps1   # įdiegtas įrankis (naudoja .env)
```

## ElevenLabs agentas
1. ElevenLabs → Agents → Create agent.
2. **First message** ir **System prompt**: iš `agent/system_prompt.md`.
3. Kalba: lietuvių. Balsas: ramus, šiltas.
4. **Tools** → Add tool → Webhook: abu įrankiai iš `agent/tools.json` (header `x-agent-secret` kaip secret).
5. **Phone numbers** → prijungti Twilio numerį.

## Archyvas
Ankstesnė versija (registracija paslaugoms: DB, `agent-tools`, `agent/archyvas-registracijos/`)
paliekama repo, jei vėl prireiktų.
