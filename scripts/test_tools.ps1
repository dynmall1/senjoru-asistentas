# Visos pokalbio eigos testas per tikrus agento įrankius.
# Paleisti: powershell -ExecutionPolicy Bypass -File scripts\test_tools.ps1
# Naudoja SUPABASE_URL ir AGENT_SECRET iš .env. Sukurta testinė registracija pabaigoje atšaukiama.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$envFile = Join-Path $PSScriptRoot '..\.env'
$cfg = @{}
Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -match '^\s*([A-Z_]+)=(.*)$' } | ForEach-Object { $cfg[$Matches[1]] = $Matches[2].Trim() }

$base = "$($cfg.SUPABASE_URL)/functions/v1/agent-tools"
$headers = @{ 'x-agent-secret' = $cfg.AGENT_SECRET }

function Call($tool, $body) {
    $json = $body | ConvertTo-Json -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $r = Invoke-RestMethod "$base/$tool" -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes
    $status = if ($r.ok) { 'OK ' } else { 'ERR' }
    Write-Host "[$status] $tool -> $($r.message)"
    return $r
}

$phone = '8 699 99999'   # testinis numeris

Call identify_client @{ phone = '+37060000000' } | Out-Null
$c = Call identify_client @{ phone = $phone }
if (-not $c.found) { Call register_client @{ phone = $phone; full_name = 'Testas Testauskas' } | Out-Null }

$s = Call search_services @{ query = 'norėčiau pas kirpėją'; city = 'Vilniuje' }
$serviceId = $s.results[0].service_id
Call search_services @{ query = 'skauda dantis' } | Out-Null
Call search_services @{ query = 'sraigtasparnis' } | Out-Null

Call get_available_slots @{ service_id = $serviceId; day = 'antradienį'; part_of_day = 'popietė' } | Out-Null
$slots = Call get_available_slots @{ service_id = $serviceId; day = 'rytoj' }
$slotId = $slots.slots[0].slot_id

$b = Call create_booking @{ phone = $phone; slot_id = $slotId }
Call create_booking @{ phone = '+37060000000'; slot_id = $slotId } | Out-Null   # turi nepavykti: laikas užimtas
Call list_my_bookings @{ phone = $phone } | Out-Null
Call cancel_booking @{ phone = $phone; booking_id = $b.booking_id } | Out-Null
Call cancel_booking @{ phone = $phone; booking_id = $b.booking_id } | Out-Null   # turi nepavykti: jau atšaukta

# Be slaptažodžio turi būti 401
try { Invoke-RestMethod "$base/identify_client" -Method Post -Body '{}' -ContentType 'application/json' | Out-Null; Write-Host '[ERR] be slaptažodžio praėjo!' }
catch { Write-Host "[OK ] be slaptažodžio -> $($_.Exception.Response.StatusCode.value__)" }
