<#{
.SYNOPSIS
  以本机 CDP 模式启动 WorkBuddy，并应用主题。
.EXAMPLE
  .\scripts\apply.ps1
  .\scripts\apply.ps1 -Theme aurora-lab -WorkBuddyExe 'D:\WorkBuddy\WorkBuddy.exe'
#>
[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)][int]$Port = 9223,
  [string]$Theme,
  [string]$WorkBuddyExe
)
. (Join-Path $PSScriptRoot 'common.ps1')
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$node = Find-NodeExe
$workBuddy = Find-WorkBuddyExe $WorkBuddyExe
if (-not $node) { throw '未找到 Node.js 22 或更高版本。' }
if (-not $workBuddy) { throw '未找到 WorkBuddy.exe；请使用 -WorkBuddyExe 或设置 WORKBUDDY_EXE。' }

Write-Host "WorkBuddy: $workBuddy"
Write-Host "CDP 端口:  $Port"
if (-not (Test-WorkBuddyCdp $Port)) {
  Write-Host '正在正常关闭 WorkBuddy，请先确保任务已保存……'
  Get-Process -Name 'WorkBuddy' -ErrorAction SilentlyContinue | Stop-Process
  $deadline = (Get-Date).AddSeconds(8)
  while ((Get-Process -Name 'WorkBuddy' -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
  if (Get-Process -Name 'WorkBuddy' -ErrorAction SilentlyContinue) { throw 'WorkBuddy 未能正常退出，请手动关闭后重试。' }
  Start-Process -FilePath $workBuddy -ArgumentList "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=$Port"
  $deadline = (Get-Date).AddSeconds(30)
  while (-not (Test-WorkBuddyCdp $Port)) {
    if ((Get-Date) -ge $deadline) { throw '30 秒内未发现 WorkBuddy CDP 渲染页。' }
    Start-Sleep -Milliseconds 400
  }
}
$applyArguments = @((Join-Path $repositoryRoot 'src\cli.mjs'), 'apply', '--port', [string]$Port)
if ($Theme) { $applyArguments += @('--theme', $Theme) }
& $node @applyArguments
if ($LASTEXITCODE -ne 0) { throw "主题注入失败，Node 退出码：$LASTEXITCODE" }
