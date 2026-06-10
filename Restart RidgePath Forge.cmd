@echo off
set "SCRIPT_DIR=%~dp0"

where pwsh.exe >nul 2>nul
if %ERRORLEVEL%==0 (
  start "RidgePath Forge Restart" /min pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\restart-launcher.ps1"
) else (
  start "RidgePath Forge Restart" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\restart-launcher.ps1"
)
