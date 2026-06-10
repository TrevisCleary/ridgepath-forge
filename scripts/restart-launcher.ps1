$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $PSScriptRoot "start-launcher.ps1"
$ports = @(3059, 3060, 80)

function Get-DescendantProcessIds {
  param(
    [Parameter(Mandatory = $true)]
    [int[]] $RootProcessIds,

    [Parameter(Mandatory = $true)]
    [object[]] $Processes
  )

  $ids = [System.Collections.Generic.HashSet[int]]::new()
  foreach ($processId in $RootProcessIds) {
    if ($processId -ne $PID) {
      [void] $ids.Add($processId)
    }
  }

  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($process in $Processes) {
      if ($ids.Contains([int] $process.ParentProcessId) -and -not $ids.Contains([int] $process.ProcessId)) {
        [void] $ids.Add([int] $process.ProcessId)
        $changed = $true
      }
    }
  }

  return $ids
}

$allProcesses = @(Get-CimInstance Win32_Process)
$launcherRoots = @(
  $allProcesses | Where-Object {
    $_.ProcessId -ne $PID -and
    $_.CommandLine -and (
      $_.CommandLine -like "*$startScript*" -or
      $_.CommandLine -like "*$repoRoot\node_modules*"
    )
  }
)

$launcherProcessIds = Get-DescendantProcessIds `
  -RootProcessIds @($launcherRoots | Select-Object -ExpandProperty ProcessId) `
  -Processes $allProcesses

$listenerProcessIds = @(
  Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq "Listen" } |
    Select-Object -ExpandProperty OwningProcess -Unique
)

$targetProcessIds = @(
  $listenerProcessIds | Where-Object { $launcherProcessIds.Contains([int] $_) }
)

if ($targetProcessIds.Count -gt 0) {
  $targetProcessIds |
    Sort-Object -Descending |
    ForEach-Object {
      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }

  Start-Sleep -Seconds 2
}

Start-Process -FilePath pwsh.exe `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $startScript) `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden

Write-Host "RidgePath Forge restart requested from '$repoRoot'."
