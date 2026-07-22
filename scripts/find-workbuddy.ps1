. (Join-Path $PSScriptRoot 'common.ps1')
$workBuddy = Find-WorkBuddyExe
$node = Find-NodeExe
[pscustomobject]@{
  WorkBuddy = $(if ($workBuddy) { $workBuddy } else { '未找到' })
  Node = $(if ($node) { $node } else { '未找到' })
  NodeVersion = $(if ($node) { & $node --version } else { '未知' })
} | Format-List
