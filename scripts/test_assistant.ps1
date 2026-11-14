# Įdiegto assistant-tools testas.  Paleisti: powershell -ExecutionPolicy Bypass -File scripts\test_assistant.ps1
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$cfg = @{}
Get-Content (Join-Path $PSScriptRoot '..\.env') -Encoding UTF8 | Where-Object { $_ -match '^\s*([A-Z_]+)=(.*)$' } | ForEach-Object { $cfg[$Matches[1]] = $Matches[2].Trim() }
$base = "$($cfg.SUPABASE_URL)/functions/v1/assistant-tools"
$headers = @{ 'x-agent-secret' = $cfg.AGENT_SECRET }

function Call($tool, $body) {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress))
    $r = Invoke-RestMethod "$base/$tool" -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes
    Write-Host "[$(if ($r.ok) { 'OK ' } else { 'ERR' })] $tool $($body | ConvertTo-Json -Compress)`n      $($r.message)"
}

Call get_current_time @{}
Call get_weather @{ city = 'Vilnius' }
Call get_weather @{ city = 'Kaune'; day = 'rytoj' }
Call get_weather @{ city = 'Šiauliai'; day = 'šeštadienį' }
Call get_weather @{ city = 'Neegzistuojantis' }
Call get_weather @{}
Call find_place @{ query = 'Halės turgus'; city = 'Vilnius' }
Call find_place @{ query = 'poliklinika'; near = 'ISM universitetas'; city = 'Vilnius' }
Call find_place @{ query = 'vaistinė'; near = 'Savanorių prospektas 100'; city = 'Kaunas' }
Call find_place @{}
Call web_search @{ query = 'Urmo bazė Kaunas darbo laikas' }
Call web_search @{ query = 'Žalgirio rungtynės rezultatas'; recent = $true }
Call web_search @{ query = 'svarbiausios naujienos Lietuvoje šiandien'; recent = $true }
Call web_search @{}

try { Invoke-RestMethod "$base/get_current_time" -Method Post -Body '{}' -ContentType 'application/json' | Out-Null; Write-Host '[ERR] be slaptažodžio praėjo!' }
catch { Write-Host "[OK ] be slaptažodžio -> $($_.Exception.Response.StatusCode.value__)" }
