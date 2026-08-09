# background-v1 背景主题流程

WorkBuddy 5.3.8 起，本项目只创建背景主题。旧版 `home-scene-v1`、首页文案、场景图标、卡片、宠物和悬浮模块已经停用，不得生成或写入新主题。

## 素材与调用量

| 模式 | API 调用 | 输出 |
|---|---:|---|
| generate | 三次单图背景调用 | 三张 2048×1152 背景候选 |
| edit | 三次单图背景调用 | 三张 2048×1152 背景候选 |
| direct | 0 | 一张用户参考背景 |

所有生成请求固定使用 `gpt-image-2`、`quality=low`、`response_format=url`、`n=1`。禁止文字、字母、排版、UI 框架、WorkBuddy 标志和水印。

## 作业步骤

1. `resume` 检查是否有 `background-v1` 作业。旧版 `home-scene-v1` 作业不得继续执行派生模块生成。
2. 没有可恢复作业时运行 `init`。本地参考图必须先取得隐私确认，再上传为公开 HTTPS URL；远端删除不作承诺。
3. generate/edit 说明三次单图背景调用并运行 `confirm --gate generation`；direct 不产生生成调用。
4. generate/edit 使用一个 `run-backgrounds` 前台批次并行完成三次 `n=1`。保持当前窗口，分段 wait/read 到终态。
5. 运行 `ingest --role background` 和 `preview --role background`。部分失败只保留成功候选，必须经新增授权才能补齐，不自动重试。
6. 创建 `background-v1` 规格。它只允许 `template`、`name`、`colors` 和 `art`，不得包含文案或组件字段。
7. 取得最终确认，运行 `confirm --gate final`、`accept --spec` 和 `apply --theme`。

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
node scripts/theme-generation-job.mjs confirm --job <jobId> --gate final
node scripts/theme-generation-job.mjs accept --job <jobId> --spec <generation-spec.json>
node src/cli.mjs apply --theme <themeId> --port 9223
```

`run-derived`、`verify-home` 和 `reopen-verification` 在仅背景模式中已禁用。

## 规格

```json
{
  "template": "background-v1",
  "name": "暮色纸灯",
  "colors": { "accent": "#D98B5F", "secondary": "#E9C46A", "surface": "#1D1A20", "text": "#FFF7ED" },
  "art": { "focusX": 0.68, "focusY": 0.48, "safeArea": "left" }
}
```

最终主题的 `modules` 必须为空，并且不得出现 `homeHeader` 或 `copySets`。作业记录不得保存 API key、Authorization、大 base64、自由 CSS/JavaScript/选择器或完整原始响应。
