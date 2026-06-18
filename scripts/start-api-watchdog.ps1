$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$serverScript = Join-Path $repoRoot "server\index.js"
$logDir = Join-Path $repoRoot ".launcher-logs"
$outLog = Join-Path $logDir "forge-api.out.log"
$errLog = Join-Path $logDir "forge-api.err.log"
$watchdogLog = Join-Path $logDir "forge-api-watchdog.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$envFiles = @(
  (Join-Path $repoRoot ".env.local"),
  (Join-Path $repoRoot ".env")
)

foreach ($envFile in $envFiles) {
  if (Test-Path $envFile) {
    Get-Content -Path $envFile | ForEach-Object {
      $line = $_.Trim()
      if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
        return
      }
      $name, $value = $line.Split("=", 2)
      if ($name) {
        [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
      }
    }
  }
}

while ($true) {
  $startedAt = Get-Date -Format o
  Add-Content -Path $watchdogLog -Value "[$startedAt] Starting Forge API: $serverScript"

  $process = Start-Process -FilePath "node.exe" `
    -ArgumentList @($serverScript) `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru

  $process.WaitForExit()
  $exitedAt = Get-Date -Format o
  Add-Content -Path $watchdogLog -Value "[$exitedAt] Forge API exited with code $($process.ExitCode). Restarting in 2 seconds."
  Start-Sleep -Seconds 2
}
