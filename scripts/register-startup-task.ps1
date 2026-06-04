$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $PSScriptRoot "start-launcher.ps1"
$taskName = "Local Project Launcher"
$pwshCommand = Get-Command pwsh.exe -ErrorAction SilentlyContinue
$pwsh = $null

if ($pwshCommand) {
  $pwsh = $pwshCommand.Source
}

if (-not $pwsh) {
  $pwsh = (Get-Command powershell.exe).Source
}

$action = New-ScheduledTaskAction -Execute $pwsh -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Starts the local project launcher on sign-in." -Force | Out-Null
Write-Host "Registered scheduled task '$taskName'."
