$ErrorActionPreference = "Stop"

$hostsPath = Join-Path $env:WINDIR "System32\drivers\etc\hosts"
$desired = "127.0.0.1 dev-launcher devlauncher"
$current = Get-Content -Raw -Path $hostsPath

if ($current -match "(?m)^\s*127\.0\.0\.1\s+.*\bdev-launcher\b") {
  Write-Host "dev-launcher is already present in hosts."
  return
}

Add-Content -Path $hostsPath -Value "`r`n# Local Project Launcher`r`n$desired" -Encoding ASCII
Write-Host "Registered dev-launcher and devlauncher in hosts."
