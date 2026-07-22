# 固定模板半自动主题流程

AI只决定图片、配色和有限长度纯文字。五个 module 的 slot、order、anchor、kind、box、选择器、action 和原生功能语义全部固定。

## 图片规格

所有调用固定 `model=gpt-image-2`、`quality=low`、`response_format=url`。提示词由作业工具强制追加“禁止文字、字母、排版、UI框架、WorkBuddy标志和水印”。

| 素材 | API请求 | 最终文件 |
|---|---|---|
| 背景候选 | 3次 `n=1` 并行调用，每张2048×1152 | 三张 2048×1152 JPEG，每张建议≤12 MB，合计硬上限60 MB |
| `home-welcome` | 1024×1024 | 透明PNG，≤4 MB |
| 三个场景图标 | 各1024×1024 | 各1024×1024透明PNG，≤4 MB |
| `composer-companion` | 1024×1024 | 透明PNG，≤2 MB |

直接使用参考图时只有一张背景，不调用背景生图。其余五张模块仍是五次独立请求，并通过一个前台命令并行等待。

## 一次授权流程

图片请求只能由同一 WorkBuddy 任务启用的 `$nonelinear-image` 执行；不得改用 WorkBuddy 内置图片生成工具、`nl` CLI、`curl` 或临时 API 请求。本地参考图上传得到的公开 HTTPS URL 不承诺远端删除。

1. `resume` 恢复最近作业；只有没有作业时才 `init`。
2. 本地参考图先取得上传隐私确认并上传。
3. 在开始前说明完整调用量，执行 `confirm --gate generation`：
   - generate/edit：三次单图背景调用 + 五次模块调用，共八次；只做一次用户确认。
   - direct：零次背景请求 + 五次模块请求。
4. generate/edit 运行一个 `run-backgrounds` 前台批次，并行执行三次 `n=1`，取得三条公开 HTTPS URL；direct 直接 `ingest`。这是一个用户操作和一个等待窗口，但计费上是三次 API 调用。
5. `ingest --role background` 下载并标准化全部候选。部分调用失败时保留成功候选并停止；只有用户按缺少数量再次明确授权后才能补齐，不自动重试。
6. `preview` 返回 `previews[]`；向用户展示三张或地址，默认方案1并立即继续，不设置背景确认门禁。
7. 以方案1为风格参考，准备五个提示词并运行一个 `run-derived`。同一进程并行等待五张，全部结束后才返回。
8. 依次 `ingest` 五张模块，生成专注/轻松/活力三套文案规格，取得最终确认。
9. `accept --spec` 在当前任务页构建并永久保存；随后显式 `apply --theme`。不要求返回 Home。

调用前固定提醒：“预计需要1–10分钟，请保持当前窗口打开，不要重复提交；我会在本轮持续等待。只有任务真正中断时，发送‘继续’才会恢复原作业，不会自动再次计费。”

`run-image` 和 `run-derived` 是前台阻塞命令。宿主等待上限至少660秒；返回 task/cell/process 句柄时，必须在同一轮每次不超过60秒地继续 wait/read 直到终态。禁止后台启动、另起轮询进程、重复提交或让用户追问进度。超时、空输出或传输中断记为 `outcome_unknown`。

## 命令索引

```powershell
node scripts/theme-generation-job.mjs resume
node scripts/theme-generation-job.mjs preflight --skill-script <nonelinear脚本> --python <python.exe>
node scripts/theme-generation-job.mjs init --name "主题名" --prompt-file <提示词> [--reference <HTTPS或本地图片> --reference-mode <edit|direct>]
node scripts/theme-generation-job.mjs confirm --job <jobId> --gate upload
node scripts/theme-generation-job.mjs upload-reference --job <jobId> --script scripts/upload-reference.py --python <python.exe>
node scripts/theme-generation-job.mjs confirm --job <jobId> --gate generation
node scripts/theme-generation-job.mjs run-backgrounds --job <jobId> --prompt-file <提示词> --skill-script <nonelinear脚本>
node scripts/theme-generation-job.mjs ingest --job <jobId> --role background --python <python.exe>
node scripts/theme-generation-job.mjs preview --job <jobId> --role background
node scripts/theme-generation-job.mjs run-derived --job <jobId> --prompt-dir <prompts目录> --skill-script <nonelinear脚本>
node scripts/theme-generation-job.mjs status --job <jobId>
node scripts/theme-generation-job.mjs confirm --job <jobId> --gate final
node scripts/theme-generation-job.mjs accept --job <jobId> --spec <generation-spec.json>
node scripts/theme-generation-job.mjs verify-home --job <jobId> --spec <generation-spec.json> --wait 60 --port 9223
node scripts/theme-generation-job.mjs discard --job <jobId>
```

单项重做前用 `authorize --job <jobId> --call <role>` 增加一次明确授权。补齐背景时按缺少数量使用 `--count 1|2|3`，已成功候选会保留；完整背景重做使用 `--count 3` 并使旧候选和派生结果失效。切换已有背景不调用 API。

从 `1.3.0` 之前的 `incomplete_image_output（实际1张）` 恢复时不得重新 `init` 或删除作业。先 `resume --job <原jobId>`；由于旧版本没有保存那张返回图，取得用户对3次替代调用的明确授权后执行 `authorize --call background --count 3`，再运行 `run-backgrounds`。新版批次会保存每一张成功候选。

## generation-spec.json

`copy` 与第一套文案保持相同，供旧版本读取。新版本另外要求三套固定 ID 和标签：

```json
{
  "template": "home-scene-v1",
  "name": "暮色纸灯",
  "colors": { "accent": "#D98B5F", "secondary": "#E9C46A", "surface": "#1D1A20", "text": "#FFF7ED" },
  "art": { "focusX": 0.68, "focusY": 0.48, "safeArea": "left" },
  "copy": {
    "homeHeader": { "title": "暮色纸灯", "subtitle": "在静谧灯影里继续今天" },
    "hero": { "eyebrow": "暮色书房", "title": "在柔光里完成今天", "subtitle": "保持节奏，让工作自然推进。" },
    "scenes": {
      "daily": { "meaning": "office", "title": "日常办公" },
      "code": { "meaning": "development", "title": "代码开发" },
      "design": { "meaning": "creative", "title": "设计创意" }
    },
    "composerLabel": "纸灯陪伴装饰"
  },
  "copySets": [
    { "id": "focus", "label": "专注", "copy": "与上方 copy 相同结构" },
    { "id": "relaxed", "label": "轻松", "copy": "同结构的轻松文案" },
    { "id": "energy", "label": "活力", "copy": "同结构的活力文案" }
  ]
}
```

实际 JSON 中每个 `copySets[].copy` 必须是完整对象，不能使用示例字符串。三套都保留 office/development/creative 语义；`home-welcome` 默认不含 badge。

## 保存和兼容

主题清单保留旧字段 `background`，同时写入 `backgrounds[]`；第一项就是默认背景。旧单背景主题加载时自动视为一张。`copySets[]` 的第一套同步写入 `homeHeader` 和 `modules[].text`，旧运行时仍可显示。

接受后主题永久位于 `%LOCALAPPDATA%\WorkBuddySkinLab\themes\<themeId>`。“保存当前主题（下次启动）”会把固定主题 ID 写入 `preferredActiveId`。🎨 中的背景选择、文案套装和手动文字按主题保存；手动文字还按套装隔离。Home 模块只在以后自然进入 Home、真实锚点探测成功时挂载。

作业记录不得保存 API key、Authorization、大 base64、自由 CSS/JavaScript/选择器/action 或完整原始响应。
