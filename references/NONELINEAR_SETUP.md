# NoneLinear 配置

WorkBuddy Skin Lab 的半自动主题流程只调用 WorkBuddy 中已安装并启用的 `$nonelinear-image` Skill。不要把真实 API key 发到聊天、截图、主题文件或作业记录中。

第一次使用、希望直接照步骤在 WorkBuddy 中运行，请先阅读 [`docs/BEGINNER_WORKBUDDY_THEME.md`](../docs/BEGINNER_WORKBUDDY_THEME.md)。

## 1. 在 WorkBuddy 安装两个 Skill

在 WorkBuddy 左侧进入“更多 → 专家·技能·连接器 → 技能”，点击“添加技能 → 上传技能”，依次导入发布目录中的：

- `WorkBuddy-Skin-Lab-1.3.1-Skill.zip`
- `NoneLinear-Image-0.1.0-Skill.zip`

导入后在“已安装”中只启用这两个 Skill。WorkBuddy 官方支持通过本地技能包导入，并可在对话中直接调用。主题 Skill 只调用 NoneLinear Skill 自带的 `scripts/generate-image.mjs`；不使用 WorkBuddy 内置图片生成工具、`nl`、`curl` 或临时 API 请求。

图片标准化还需要 Python 3 和 Pillow：

```powershell
python -m pip install Pillow
```

## 2. 临时配置：从同一 PowerShell 启动 WorkBuddy

```powershell
$env:NONELINEAR_API_KEY = "nl-xxx"
Set-Location "<项目目录>"
.\scripts\apply.ps1
```

必须从同一个 PowerShell 窗口启动 WorkBuddy，WorkBuddy 内的 Skill 子进程才能继承变量。关闭窗口后，临时变量失效；以后从普通快捷方式启动 WorkBuddy 时也不会带上该临时 key。

只检查状态、不显示 key：

```powershell
if ([string]::IsNullOrWhiteSpace($env:NONELINEAR_API_KEY)) {
  "NONELINEAR_API_KEY: missing"
} else {
  "NONELINEAR_API_KEY: configured"
}
```

## 3. Windows 用户级持久配置

```powershell
[Environment]::SetEnvironmentVariable(
  "NONELINEAR_API_KEY",
  "nl-xxx",
  "User"
)
```

配置后完全退出 WorkBuddy，再双击项目的 `开始使用.bat` 重新启动。该方式会把 key 保存在当前 Windows 用户的环境变量中，不应在共享账户使用。

删除持久配置：

```powershell
[Environment]::SetEnvironmentVariable(
  "NONELINEAR_API_KEY",
  $null,
  "User"
)
```

## 4. cc-switch / Agent 注入兼容顺序

生成脚本和上传脚本只按下列顺序取值：

1. `NONELINEAR_API_KEY`
2. `Nonelinear_API_KEY`
3. `OPENAI_API_KEY`，仅当 `OPENAI_BASE_URL` 是 HTTPS、主机严格等于 `api.nonelinear.com` 且端口为空或 443
4. `ANTHROPIC_AUTH_TOKEN` 或 `ANTHROPIC_API_KEY`，仅当 `ANTHROPIC_BASE_URL` 满足同一条件

脚本不读取 `.env`、cc-switch 数据库、WorkBuddy 配置文件或其他本地密钥存储。只有当 cc-switch 或其他 Agent 启动器把批准的变量注入 WorkBuddy 进程时才会兼容。预检只输出 `configured` 或 `missing`。

## 5. 本地参考图说明

本地图片只有在每个作业首次上传前得到明确确认后，才会上传到固定地址 `https://nonelinear.com/api/upload-file`。确认文字是：

> 该图片将上传到 NoneLinear 服务器并获得公开 HTTPS URL。

首版只支持一张 PNG、JPEG 或 WebP，大小为 1 B–20 MB。工具会检查扩展名、文件签名和 MIME。接受或取消作业时只清理本地 URL 记录和临时文件，不承诺远端服务器自动删除。
