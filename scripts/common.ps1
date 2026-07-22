$ErrorActionPreference = 'Stop'

function Find-WorkBuddyExe([string]$ExplicitPath) {
  if ($ExplicitPath -and (Test-Path -LiteralPath $ExplicitPath -PathType Leaf)) { return (Resolve-Path -LiteralPath $ExplicitPath).Path }
  if ($env:WORKBUDDY_EXE -and (Test-Path -LiteralPath $env:WORKBUDDY_EXE -PathType Leaf)) { return (Resolve-Path -LiteralPath $env:WORKBUDDY_EXE).Path }
  $candidates = @(
    'D:\WorkBuddy\WorkBuddy.exe',
    (Join-Path $env:LOCALAPPDATA 'workbuddy\WorkBuddy.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\workbuddy\WorkBuddy.exe'),
    (Join-Path $env:ProgramFiles 'WorkBuddy\WorkBuddy.exe')
  )
  if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'WorkBuddy\WorkBuddy.exe') }
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return (Resolve-Path -LiteralPath $candidate).Path }
  }
  foreach ($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
    foreach ($entry in (Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*WorkBuddy*' -and $_.InstallLocation })) {
      $candidate = Join-Path $entry.InstallLocation 'WorkBuddy.exe'
      if (Test-Path -LiteralPath $candidate -PathType Leaf) { return (Resolve-Path -LiteralPath $candidate).Path }
    }
  }
  return $null
}

function Find-NodeExe {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return $null
}

function Test-WorkBuddyCdp([int]$Port) {
  try {
    $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 1
    return [bool]($targets | Where-Object { $_.type -eq 'page' -and $_.url -like '*renderer/index.html*' })
  } catch { return $false }
}
