# 固定模板半自动主题流程

此流程只让 AI 决定视觉内容：背景提示词、配色、首页原生主副标题、有限长度的模块纯文字和五张素材的提示词。槽位、顺序、锚点、box、选择器、action 和原生功能语义全部固定。

## 固定模板

模板版本为 `home-scene-v1`，包含五个模块：

| ID | 固定槽位 | 生成请求 | 最终文件 |
|---|---|---|---|
| `home-welcome` | `home-hero` | 1024×1024 | 透明 PNG，≤4 MB |
| `scene-daily` | `scene-icon:0`，办公语义 | 1024×1024 | 512×512 透明 PNG，建议≤1 MB |
| `scene-code` | `scene-icon:1`，开发语义 | 1024×1024 | 512×512 透明 PNG，建议≤1 MB |
| `scene-design` | `scene-icon:2`，创意语义 | 1024×1024 | 512×512 透明 PNG，建议≤1 MB |
| `composer-companion` | `composer-float` | 1024×1024 | 512×512 透明 PNG，≤2 MB |

背景请求和最终文件均为 2048×1152，最终保存为 JPEG，建议≤12 MB。所有调用固定使用 `gpt-image-2`、`quality=low`、`response_format=url`。透明素材提示词必须要求单个主体、纯色键背景；本地标准化器负责去背。图片中禁止文字、UI 框架、WorkBuddy 标志和水印。

## 分阶段授权

图片请求只能由同一 WorkBuddy 任务已启用的 `$nonelinear-image` 执行，不得改用 WorkBuddy 内置图片生成工具、`nl` CLI、`curl` 或临时 API 请求。作业初始请求只授权一次背景调用；超时、空输出或传输中断均不自动重试。本地参考图上传形成的公开 HTTPS URL 只作本次流程记录，不承诺远端删除。

1. 用户给出主题提示词和可选的一张参考图。
2. 运行 `doctor`、`validate` 和 CDP 状态。用户可留在任务页完成背景与候选素材阶段；此时不构建 modules。
3. 开始前确定背景模式：无参考图为 `generate`；参考图生成新背景为 `edit`；原图直接作为背景为 `direct`。本地参考图仍需先取得上传确认。
4. `generate` / `edit` 初始只授权一次背景调用；`direct` 不授权背景调用。调用前提醒预计等待1–10分钟；失败不重试。
5. 下载或复制、标准化后运行 `preview`，把返回的 Markdown 图片及 URL/路径交给用户。未经预览不能确认背景。
6. 用户接受背景时，同时确认继续五次派生素材调用。AI生成结构化规格、首页主副标题和五个统一风格提示词；主副标题不增加图片调用。
7. 五张素材逐张调用；任一次失败都停止并等待授权，不能自动重试。
8. 标准化图片，作业进入 `media-ready`；所有素材仍经同一校验链。
9. 用户在当前任务页最终确认后，`accept --spec` 构建并固化主题，状态为 `accepted-pending-home`；无需进入 Home。
10. 显式 `apply --theme` 保存活动主题。以后自然进入 Home 时，Runtime 真实探测锚点并只挂载兼容模块。
11. `verify-home` 保留为可选高级验收，不再阻止主题保存。

## 作业命令

作业默认位于 `%LOCALAPPDATA%\WorkBuddySkinLab\generation-jobs\<jobId>`。命令只输出 JSON。

```powershell
node scripts/theme-generation-job.mjs resume
node scripts/theme-generation-job.mjs preflight --skill-script <nonelinear-skill脚本> --python <python.exe>
node scripts/theme-generation-job.mjs init --name "主题名" --prompt-file <主题提示词文件> [--reference <公开HTTPS或本地图片> --reference-mode <edit|direct>]
node scripts/theme-generation-job.mjs confirm --job <jobId> --gate upload
node scripts/theme-generation-job.mjs upload-reference --job <jobId> --script scripts/upload-reference.py --python <python.exe>
node scripts/theme-generation-job.mjs run-image --job <jobId> --role background --prompt-file <背景提示词> --skill-script <nonelinear-skill脚本>
node scripts/theme-generation-job.mjs ingest --job <jobId> --role background --python <python.exe>
node scripts/theme-generation-job.mjs preview --job <jobId> --role background
node scripts/theme-generation-job.mjs confirm --job <jobId> --gate background
node scripts/theme-generation-job.mjs run-image --job <jobId> --role home-welcome --prompt-file <素材提示词> --skill-script <nonelinear-skill脚本>
node scripts/theme-generation-job.mjs verify-home --job <jobId> --spec <generation-spec.json> --wait 60 --port 9223
node scripts/theme-generation-job.mjs reopen-verification --job <jobId>
node scripts/theme-generation-job.mjs status --job <jobId>
node scripts/theme-generation-job.mjs confirm --job <jobId> --gate final
node scripts/theme-generation-job.mjs accept --job <jobId> --spec <generation-spec.json>
node scripts/theme-generation-job.mjs discard --job <jobId>
```

`resume` 不需要 job ID：它只扫描 WorkBuddy Skin Lab 自己的 `generation-jobs` 目录，自动选择最近更新且未丢弃的
作业，并返回 `progress`、`nextAction` 和 `requiresUser`；已接受主题会直接返回 `apply-theme`。每次用户说“继续”“好了吗”或任务
被中断后都先运行它；不要重新 init。每个前台步骤完成后再次运行 `resume`，当 `requiresUser: false` 时继续执行唯一
下一步，直到需要上传、计费、背景或最终确认。禁止启动脱离作业记录的后台进程。

接受主题后，最终目录永久保存在 `%LOCALAPPDATA%\WorkBuddySkinLab\themes\<themeId>`。随后显式执行一次
`node src/cli.mjs apply --theme <themeId> --port 9223` 会把活动 ID 写入 `settings.json`；以后双击“开始使用”自动恢复。

重试前用 `authorize --job <jobId> --call <role>` 只增加对应角色的一次调用额度。

## generation-spec.json

```json
{
  "template": "home-scene-v1",
  "name": "暮色纸灯",
  "colors": {
    "accent": "#D98B5F",
    "secondary": "#E9C46A",
    "surface": "#1D1A20",
    "text": "#FFF7ED"
  },
  "art": { "focusX": 0.68, "focusY": 0.48, "safeArea": "left" },
  "copy": {
    "homeHeader": {
      "title": "暮色纸灯",
      "subtitle": "在静谧灯影里继续今天"
    },
    "hero": {
      "eyebrow": "TWILIGHT STUDIO",
      "title": "在柔光里完成今天",
      "subtitle": "保持节奏，让原生工作流继续服务。"
    },
    "scenes": {
      "daily": { "meaning": "office", "title": "日常办公" },
      "code": { "meaning": "development", "title": "代码开发" },
      "design": { "meaning": "creative", "title": "设计创意" }
    },
    "composerLabel": "纸灯陪伴装饰"
  }
}
```

作业记录不得保存 API key、Authorization、大 base64、自由 CSS/JavaScript/选择器/action 或完整原始响应。接受后只保留最终素材、提示词、固定规格和脱敏生成摘要。
