[CmdletBinding()]
param([ValidateRange(1024, 65535)][int]$Port = 9223)
. (Join-Path $PSScriptRoot 'common.ps1')
$node = Find-NodeExe
if (-not $node) { throw '未找到 Node.js。' }
if (-not (Test-WorkBuddyCdp $Port)) {
  Write-Host 'WorkBuddy Skin Lab is not active; the interface is already native.'
  exit 0
}
& $node (Join-Path (Split-Path -Parent $PSScriptRoot) 'src\cli.mjs') pause --port $Port
if ($LASTEXITCODE -ne 0) { throw "恢复原生界面失败，Node 退出码：$LASTEXITCODE" }
