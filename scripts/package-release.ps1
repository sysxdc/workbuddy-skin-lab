<#
.SYNOPSIS
  校验项目并生成可分发的 Windows ZIP。
.PARAMETER OutputDirectory
  ZIP 输出目录，默认为仓库下的 release。
#>
[CmdletBinding()]
param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packageJson = Get-Content -LiteralPath (Join-Path $repositoryRoot 'package.json') -Raw | ConvertFrom-Json
$version = [string]$packageJson.version
if ($version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') { throw "package.json 版本号无效：$version" }

if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repositoryRoot 'release' }
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw '未找到 Node.js 22 或更高版本。' }
$major = [int]((& $node.Source --version).TrimStart('v').Split('.')[0])
if ($major -lt 22) { throw "Node.js 版本过低：需要 22+，当前为 $major" }

Write-Host '1/4 检查 JavaScript 语法……'
& $node.Source (Join-Path $repositoryRoot 'src\cli.mjs') validate | Out-Host
if ($LASTEXITCODE -ne 0) { throw '主题校验失败。' }
& $node.Source --check (Join-Path $repositoryRoot 'src\cli.mjs')
if ($LASTEXITCODE -ne 0) { throw 'JavaScript 语法检查失败。' }
& $node.Source --check (Join-Path $repositoryRoot 'scripts\theme-generation-job.mjs')
if ($LASTEXITCODE -ne 0) { throw '主题生成作业脚本语法检查失败。' }
& $node.Source --check (Join-Path $repositoryRoot 'scripts\run-nonelinear-image.mjs')
if ($LASTEXITCODE -ne 0) { throw 'NoneLinear 受控调用器语法检查失败。' }

Write-Host '2/4 运行自动测试……'
Push-Location $repositoryRoot
try {
  $testFiles = @(Get-ChildItem -LiteralPath (Join-Path $repositoryRoot 'test') -Filter '*.test.mjs' -File | Sort-Object Name | Select-Object -ExpandProperty FullName)
  if ($testFiles.Count -eq 0) { throw '未找到自动测试文件。' }
  & $node.Source --test @testFiles
} finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw '自动测试失败。' }

$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
  & $python.Source -m py_compile (Join-Path $repositoryRoot 'scripts\upload-reference.py') (Join-Path $repositoryRoot 'scripts\normalize-generated-image.py')
  if ($LASTEXITCODE -ne 0) { throw 'Python 脚本语法检查失败。' }
  Push-Location $repositoryRoot
  try { & $python.Source -m unittest discover -s test -p 'test_python_suite.py' } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Python 自动测试失败。' }
} else {
  Write-Warning '未找到 python，跳过可选的 NoneLinear 图片处理测试；使用生成功能前必须按 references/NONELINEAR_SETUP.md 配置 Python/Pillow。'
}

$packageName = "WorkBuddy-Skin-Lab-$version-Windows"
$temporaryBase = [System.IO.Path]::GetTempPath()
$temporaryRoot = Join-Path $temporaryBase ("workbuddy-skin-lab-package-" + [guid]::NewGuid().ToString('N'))
$stageRoot = Join-Path $temporaryRoot $packageName
$zipPath = Join-Path $resolvedOutput "$packageName.zip"

Write-Host '3/4 组装发布目录……'
New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null
  $files = @(
    '.gitattributes', '.gitignore', 'LICENSE', 'NOTICE.md', 'README.md', 'SKILL.md', 'package.json',
    'check-environment.cmd', 'start-skin.cmd', 'restore-native.cmd',
    '开始使用.bat', '恢复原生.bat', '环境检查.bat'
  )
$directories = @('docs', 'evals', 'references', 'scripts', 'src', 'test', 'themes')
try {
  foreach ($relativePath in $files) {
    Copy-Item -LiteralPath (Join-Path $repositoryRoot $relativePath) -Destination $stageRoot
  }
  foreach ($relativePath in $directories) {
    Copy-Item -LiteralPath (Join-Path $repositoryRoot $relativePath) -Destination $stageRoot -Recurse
  }
  # Python 测试会生成带本机绝对路径的字节码缓存，发布包不得包含它们。
  Get-ChildItem -LiteralPath $stageRoot -Recurse -Directory -Filter '__pycache__' |
    Remove-Item -Recurse -Force
  Get-ChildItem -LiteralPath $stageRoot -Recurse -File -Filter '*.pyc' |
    Remove-Item -Force
  $skillPackages = @(
    Join-Path $resolvedOutput "WorkBuddy-Skin-Lab-$version-Skill.zip"
    Join-Path $resolvedOutput 'NoneLinear-Image-0.1.0-Skill.zip'
  )
  if (($skillPackages | Where-Object { Test-Path -LiteralPath $_ }).Count -eq $skillPackages.Count) {
    $skillPackageDirectory = Join-Path $stageRoot 'skill-packages'
    New-Item -ItemType Directory -Force -Path $skillPackageDirectory | Out-Null
    foreach ($skillPackage in $skillPackages) { Copy-Item -LiteralPath $skillPackage -Destination $skillPackageDirectory }
  } else {
    Write-Warning '未找到两个 WorkBuddy Skill ZIP；Windows 包仍会生成，但需先运行 scripts\package-workbuddy-skills.ps1 才能包含原生 Skill 安装包。'
  }

  Write-Host '4/4 生成 ZIP……'
  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  Compress-Archive -LiteralPath $stageRoot -DestinationPath $zipPath -CompressionLevel Optimal
} finally {
  $resolvedTemporary = [System.IO.Path]::GetFullPath($temporaryRoot)
  if ($resolvedTemporary.StartsWith([System.IO.Path]::GetFullPath($temporaryBase), [System.StringComparison]::OrdinalIgnoreCase) -and
      [System.IO.Path]::GetFileName($resolvedTemporary).StartsWith('workbuddy-skin-lab-package-', [System.StringComparison]::Ordinal)) {
    Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$archive = Get-Item -LiteralPath $zipPath
[pscustomobject]@{
  Package = $archive.FullName
  Version = $version
  SizeMB = [Math]::Round($archive.Length / 1MB, 2)
  IncludesWorkBuddy = $false
  RequiresNode = '22+'
} | Format-List
