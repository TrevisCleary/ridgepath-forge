$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

$apiWatchdogScript = Join-Path $repoRoot "scripts\start-api-watchdog.ps1"
$redirectScript = Join-Path $repoRoot "server\redirect.js"
$logDir = Join-Path $repoRoot ".launcher-logs"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Start-Process -FilePath "pwsh.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $apiWatchdogScript) `
  -WorkingDirectory $repoRoot `
  -RedirectStandardOutput (Join-Path $logDir "forge-api-watchdog.out.log") `
  -RedirectStandardError (Join-Path $logDir "forge-api-watchdog.err.log") `
  -WindowStyle Hidden

Start-Process -FilePath "npm.cmd" `
  -ArgumentList @("run", "client") `
  -WorkingDirectory $repoRoot `
  -RedirectStandardOutput (Join-Path $logDir "forge-client.out.log") `
  -RedirectStandardError (Join-Path $logDir "forge-client.err.log") `
  -WindowStyle Hidden

Start-Process -FilePath "node.exe" `
  -ArgumentList @($redirectScript) `
  -WorkingDirectory $repoRoot `
  -RedirectStandardOutput (Join-Path $logDir "forge-redirect.out.log") `
  -RedirectStandardError (Join-Path $logDir "forge-redirect.err.log") `
  -WindowStyle Hidden

Write-Host "RidgePath Forge startup requested from '$repoRoot'."
