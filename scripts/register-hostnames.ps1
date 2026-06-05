$ErrorActionPreference = "Stop"

$hostsPath = Join-Path $env:WINDIR "System32\drivers\etc\hosts"
$desired = "127.0.0.1 dev-launcher devlauncher"
$current = Get-Content -Raw -Path $hostsPath

$lines = Get-Content -Path $hostsPath
$filtered = $lines | Where-Object { $_ -notmatch "^\s*127\.0\.0\.1(?::\d+)?\s+.*\bdev-launcher\b" }

if ($filtered -join "`n" -match "(?m)^\s*127\.0\.0\.1\s+.*\bdev-launcher\b") {
  Write-Host "dev-launcher is already present in hosts."
  return
}

Set-Content -Path $hostsPath -Value $filtered -Encoding ASCII
Add-Content -Path $hostsPath -Value "`r`n# RidgePath Forge legacy local hostnames`r`n$desired" -Encoding ASCII
Write-Host "Registered dev-launcher and devlauncher in hosts."
