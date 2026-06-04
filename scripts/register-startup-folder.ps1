$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $PSScriptRoot "start-launcher.ps1"
$startupFolder = [Environment]::GetFolderPath("Startup")
$launcherPath = Join-Path $startupFolder "Local Project Launcher.cmd"

$content = @"
@echo off
start "Local Project Launcher" /min pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "$scriptPath"
"@

Set-Content -Path $launcherPath -Value $content -Encoding ASCII
Write-Host "Created startup entry '$launcherPath'."
