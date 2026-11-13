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
