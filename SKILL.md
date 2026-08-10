---
name: workbuddy-skin-lab
description: 在 Windows WorkBuddy 内生成、应用、保存和切换背景主题与背景粒子。不会修改首页文字或注入 WorkBuddy 组件；只通过 127.0.0.1 CDP 工作。
allowed-tools: Read, Write, Bash
---

# WorkBuddy Skin Lab（背景与粒子模式）

这是在 WorkBuddy 桌面端内部运行的背景换肤入口，不依赖 Codex。图片只调用同一 WorkBuddy 任务中已启用的 `$nonelinear-image`；脚本路径必须从 `${CODEBUDDY_SKILL_DIR}` 取得。

## 强制兼容边界

- 固定模板是 `background-v1`。
- 只生成和保存背景图片、配色、背景构图参数与背景粒子素材。
- 粒子只能是透明 PNG，并固定渲染在背景层；不得生成或执行自由 CSS、JavaScript、选择器或 DOM 操作。
- 禁止生成、编辑或注入首页标题、副标题、场景图标、卡片、宠物、悬浮装饰和其它 WorkBuddy 组件。
- 禁止使用旧模板 `home-scene-v1`，禁止创建 `homeHeader`、`copySets` 或非空 `modules`。
- 即使旧主题带有这些字段，运行时也会忽略它们。

## 先读哪一份

- 第一次使用：[`docs/BEGINNER_WORKBUDDY_THEME.md`](docs/BEGINNER_WORKBUDDY_THEME.md)
- 完整作业协议：[`references/GENERATION_WORKFLOW.md`](references/GENERATION_WORKFLOW.md)
- API Key：[`references/NONELINEAR_SETUP.md`](references/NONELINEAR_SETUP.md)

## 固定流程

1. 运行 `doctor`、`validate`、`status` 和 `theme-generation-job.mjs resume`。可恢复 `background-v1` 或 `particle-v1` 作业；旧版 `home-scene-v1` 作业不得继续生成模块。
2. 确认背景模式：`generate`（提示词生成三张）、`edit`（参考图生成三张）、`direct`（直接使用一张参考图）。本地图片上传前必须取得隐私确认。
3. generate/edit 在开始前说明“三次单图背景调用”，取得一次确认；direct 不产生图片生成调用。
4. 图片固定 `gpt-image-2`、`quality=low`、`response_format=url`、2048×1152。提示词必须禁止文字、UI 框架、WorkBuddy 标志和水印。
5. 使用一个 `run-backgrounds` 前台批次并行执行三次 `n=1`。部分失败时保留成功候选，只在用户明确授权缺少次数后补齐，绝不自动重试。
6. `ingest --role background` 后运行 `preview`；默认方案1，用户以后可在 `🎨 → 主题与背景` 切换。
7. 生成只包含 `name`、`colors` 和 `art` 的 `background-v1` 规格，取得最终确认后运行 `accept --spec`，再显式 `apply --theme`。

## AI 自定义粒子

用户要求自定义粒子时，先确认当前主题目录与以下两项描述：粒子素材描述、运动描述。运动描述只能映射为安全配方，不得输出 CSS、JavaScript 或关键帧文本。

1. 用 `particle-init --source-theme <当前主题目录> --prompt-file <粒子提示词>` 新建 `particle-v1` 作业。
2. 明确说明“将进行三次 512×512 透明 PNG 单图调用”，取得一次确认后运行 `particle-confirm --gate generation` 与 `run-particles`。
3. 运行 `ingest --role particle`、`preview --role particle`；三张候选均会保存在派生主题中，默认选择粒子1。
4. 根据运动描述生成 `particle-v1` spec 的 `motion`：`type` 仅为 `fall`、`rise`、`float`、`sweep`；其余字段必须落在脚本限制内。
5. 最终确认后运行 `particle-confirm --gate final`、`accept --spec`。这会在用户主题目录创建派生主题，不改写来源主题；然后显式 `apply --theme`。

粒子提示词必须要求“单个居中主体、透明背景、四角透明”，并禁止文字、边框、场景、Logo 与水印。每次生成前提醒同样的等待与计费说明。

每次生成前提醒：“预计需要1–10分钟，请保持当前窗口打开，不要重复提交；我会在本轮持续等待。任务中断时恢复原作业，不会自动再次计费。”

## generation-spec.json

```json
{
  "template": "background-v1",
  "name": "暮色纸灯",
  "colors": {
    "accent": "#D98B5F",
    "secondary": "#E9C46A",
    "surface": "#1D1A20",
    "text": "#FFF7ED"
  },
  "art": {
    "focusX": 0.68,
    "focusY": 0.48,
    "safeArea": "left"
  }
}
```

规格中不得出现 `copy`、`copySets`、`homeHeader` 或 `modules`。

粒子运动规格示例：

```json
{
  "template": "particle-v1",
  "name": "暮色纸灯·樱花",
  "motion": { "type": "fall", "duration": 14, "sway": 120, "rotation": 240, "pulse": 0.2, "opacity": 0.8, "twinkle": true }
}
```

## 安全边界

- 不读取聊天内容，不调用 fetch、IPC 或剪贴板，不修改 WorkBuddy 安装文件。
- 不生成自由 CSS、JavaScript、选择器或业务逻辑。
- 不保存 API key、Authorization、大 base64 或完整原始响应。
- 超时、空输出或传输中断记为 `outcome_unknown`，不得自动重试。
- `pause` 后必须恢复原生界面。

## 常用入口

```powershell
node src/cli.mjs doctor
node src/cli.mjs validate
node scripts/theme-generation-job.mjs resume
node src/cli.mjs apply --theme <themeId> --port 9223
node src/cli.mjs pause --port 9223
```
