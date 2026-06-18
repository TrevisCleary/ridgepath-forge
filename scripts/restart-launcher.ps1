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
      $_.CommandLine -like "*$repoRoot*"
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

$targetProcessIds = @($launcherProcessIds | ForEach-Object { [int] $_ })

foreach ($processId in $listenerProcessIds) {
  $listener = $allProcesses | Where-Object { [int] $_.ProcessId -eq [int] $processId } | Select-Object -First 1
  if ($listener -and $listener.CommandLine -like "*$repoRoot*") {
    $targetProcessIds += [int] $processId
  } elseif ($listener -and $listener.CommandLine -like "*server/index.js*") {
    $targetProcessIds += [int] $processId
  }
}

$targetProcessIds = @($targetProcessIds | Where-Object { $_ -ne $PID } | Sort-Object -Unique)

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

function Wait-ForHttpStatus {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Uri,

    [int] $TimeoutSeconds = 20,

    [int] $RequiredSuccesses = 3
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $successes = 0
  $lastStatus = $null
  do {
    try {
      $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 3
      $lastStatus = [int] $response.StatusCode
      if ($lastStatus -ge 200 -and $lastStatus -lt 400) {
        $successes += 1
        if ($successes -ge $RequiredSuccesses) {
          return $lastStatus
        }
      } else {
        $successes = 0
      }
    } catch {
      $lastStatus = $null
      Start-Sleep -Milliseconds 700
    }
    Start-Sleep -Milliseconds 700
  } while ((Get-Date) -lt $deadline)

  return $lastStatus
}

$apiStatus = Wait-ForHttpStatus -Uri "http://127.0.0.1:3059/api/health" -RequiredSuccesses 3
$uiStatus = Wait-ForHttpStatus -Uri "http://127.0.0.1:3060" -RequiredSuccesses 2
$apiLabel = if ($null -ne $apiStatus) { $apiStatus } else { "not ready" }
$uiLabel = if ($null -ne $uiStatus) { $uiStatus } else { "not ready" }

Write-Host "RidgePath Forge restart requested from '$repoRoot'."
Write-Host "API 3059: $apiLabel"
Write-Host "UI 3060: $uiLabel"
