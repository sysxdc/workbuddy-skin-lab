<#
.SYNOPSIS
  生成可从 WorkBuddy“添加技能 → 上传技能”导入的两个 ZIP。
.PARAMETER NonelinearSkillDirectory
  nonelinear-image 0.1.0 解包目录，目录根部必须包含 SKILL.md。
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$NonelinearSkillDirectory,
  [string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nonelinearRoot = (Resolve-Path -LiteralPath $NonelinearSkillDirectory).Path
if (-not (Test-Path -LiteralPath (Join-Path $nonelinearRoot 'SKILL.md') -PathType Leaf)) {
  throw 'NonelinearSkillDirectory 根目录缺少 SKILL.md。'
}
if (-not (Test-Path -LiteralPath (Join-Path $nonelinearRoot 'scripts\generate-image.mjs') -PathType Leaf)) {
  throw 'NonelinearSkillDirectory 缺少 scripts\generate-image.mjs。'
}

$package = Get-Content -LiteralPath (Join-Path $repositoryRoot 'package.json') -Raw | ConvertFrom-Json
$version = [string]$package.version
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repositoryRoot 'release' }
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$temporaryBase = [System.IO.Path]::GetTempPath()
$temporaryRoot = Join-Path $temporaryBase ("workbuddy-skill-package-" + [guid]::NewGuid().ToString('N'))
$skinStage = Join-Path $temporaryRoot 'workbuddy-skin-lab'
$imageStage = Join-Path $temporaryRoot 'nonelinear-image'
$skinZip = Join-Path $outputRoot "WorkBuddy-Skin-Lab-$version-Skill.zip"
$imageZip = Join-Path $outputRoot 'NoneLinear-Image-0.1.0-Skill.zip'

try {
  New-Item -ItemType Directory -Force -Path $skinStage,$imageStage | Out-Null
  foreach ($file in @('SKILL.md','LICENSE','NOTICE.md','package.json')) {
    Copy-Item -LiteralPath (Join-Path $repositoryRoot $file) -Destination $skinStage
  }
  foreach ($directory in @('docs','references','src','themes')) {
    Copy-Item -LiteralPath (Join-Path $repositoryRoot $directory) -Destination $skinStage -Recurse
  }
  # 不把本机公众号草稿混入可导入 Skill。
  Get-ChildItem -LiteralPath (Join-Path $skinStage 'docs') -File -Filter 'WECHAT_ARTICLE_*' -ErrorAction SilentlyContinue |
    Remove-Item -Force
  # Skill 运行不需要教程媒体；不打包截图或视频，避免膨胀与隐私泄露。
  Remove-Item -LiteralPath (Join-Path $skinStage 'docs\assets') -Recurse -Force -ErrorAction SilentlyContinue
  $skinScripts = Join-Path $skinStage 'scripts'
  New-Item -ItemType Directory -Force -Path $skinScripts | Out-Null
  foreach ($file in @('theme-generation-job.mjs','run-nonelinear-image.mjs','upload-reference.py','normalize-generated-image.py')) {
    Copy-Item -LiteralPath (Join-Path $repositoryRoot "scripts\$file") -Destination $skinScripts
  }
  foreach ($item in (Get-ChildItem -LiteralPath $nonelinearRoot -Force)) {
    Copy-Item -LiteralPath $item.FullName -Destination $imageStage -Recurse
  }
  $imageSkillPath = Join-Path $imageStage 'SKILL.md'
  $imageSkill = Get-Content -LiteralPath $imageSkillPath -Raw
  $imageSkill = $imageSkill.Replace(
    'In Claude Code, `${CLAUDE_SKILL_DIR}` is the skill directory. In other hosts,',
    'In WorkBuddy, `${CODEBUDDY_SKILL_DIR}` is the skill directory. In other hosts,'
  )
  $imageSkill = $imageSkill.Replace(
    'Use when a user asks Codex, Claude Code, or another shell-capable agent',
    'Use when a user asks WorkBuddy or another shell-capable agent'
  )
  if ($imageSkill -notmatch '(?m)^allowed-tools:') {
    $imageSkill = $imageSkill -replace '(?m)^(description:.*)$', "`$1`r`nallowed-tools: Read, Bash"
  }
  [System.IO.File]::WriteAllText($imageSkillPath, $imageSkill, [System.Text.UTF8Encoding]::new($false))

  & (Get-Command node -ErrorAction Stop).Source --check (Join-Path $skinStage 'scripts\theme-generation-job.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'WorkBuddy Skin Lab Skill 脚本语法检查失败。' }
  & (Get-Command node -ErrorAction Stop).Source --check (Join-Path $skinStage 'scripts\run-nonelinear-image.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'NoneLinear 受控调用器语法检查失败。' }
  & (Get-Command node -ErrorAction Stop).Source --check (Join-Path $imageStage 'scripts\generate-image.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'NoneLinear Image Skill 脚本语法检查失败。' }

  foreach ($zip in @($skinZip,$imageZip)) {
    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
  }
  Compress-Archive -Path (Join-Path $skinStage '*') -DestinationPath $skinZip -CompressionLevel Optimal
  Compress-Archive -Path (Join-Path $imageStage '*') -DestinationPath $imageZip -CompressionLevel Optimal
} finally {
  $resolvedTemporary = [System.IO.Path]::GetFullPath($temporaryRoot)
  if ($resolvedTemporary.StartsWith([System.IO.Path]::GetFullPath($temporaryBase), [System.StringComparison]::OrdinalIgnoreCase) -and
      [System.IO.Path]::GetFileName($resolvedTemporary).StartsWith('workbuddy-skill-package-', [System.StringComparison]::Ordinal)) {
    Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force -ErrorAction SilentlyContinue
  }
}

[pscustomobject]@{
  WorkBuddySkinLab = $skinZip
  NoneLinearImage = $imageZip
  ImportPath = 'WorkBuddy → 更多 → 专家·技能·连接器 → 技能 → 添加技能 → 上传技能'
} | Format-List
