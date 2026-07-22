[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$repositoryRoot = Split-Path -Parent $PSScriptRoot

Write-Host '=== WorkBuddy Skin Lab Environment Check ==='
$node = Find-NodeExe
$workBuddy = Find-WorkBuddyExe

if (-not $node) {
  Write-Host '[FAIL] Node.js was not found. Install Node.js 22 or newer.' -ForegroundColor Red
  exit 1
}
$versionText = (& $node --version).Trim()
$major = [int]$versionText.TrimStart('v').Split('.')[0]
Write-Host "Node.js:   $versionText"
if ($major -lt 22) {
  Write-Host '[FAIL] Node.js 22 or newer is required.' -ForegroundColor Red
  exit 1
}

Write-Host "WorkBuddy: $(if ($workBuddy) { $workBuddy } else { 'NOT FOUND' })"
if (-not $workBuddy) {
  Write-Host '[FAIL] Set WORKBUDDY_EXE or pass -WorkBuddyExe to scripts\apply.ps1.' -ForegroundColor Red
  exit 1
}

& $node (Join-Path $repositoryRoot 'src\cli.mjs') validate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '[OK] Environment and themes are ready.' -ForegroundColor Green

